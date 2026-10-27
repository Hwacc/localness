import { createError } from 'h3'
import { basename } from 'node:path'
import prisma from '#server/libs/prisma'
import {
  DRAFT_KEY_PREFIX,
  fpTranslation,
} from '#shared/utils'
import {
  GIT_SYNC_PREVIEW_TTL_MS,
  GIT_SYNC_PUSH_CLONE_DEPTH,
  GitSyncAdapter,
  GitSyncConflictStatus,
  GitSyncErrorCode,
  GitSyncLogAction,
  GitSyncLogStatus,
  GitSyncPreviewKind,
  GitSyncPreviewStatus,
  GitSyncPushReason,
} from '#shared/constants'
import { countSkipReasons, writeGitSyncLog } from './engine/log'
import { gitSyncError, gitSyncErrorCode } from './engine/errors'
import { withSyncLease } from './engine/lease'
import { sourceLocaleOf } from '#server/helper/i18n'
import { projectLocales } from '#server/helper/api-delivery'
import type { ThreeWayDecision } from './engine/three-way'
import {
  classifyPull,
  classifyPush,
  emptyPushCounts,
  flagStaleSources,
  isPushEligible,
  isPushSelectable,
} from './engine/filters'
import {
  withClonedRepo,
  checkoutCommit,
  commitAndPush,
  remoteHeadSha,
  findCommitByTrailer,
  treeSha,
} from './remote/git-remote'
import { seenFileMap } from './engine/seen-files'
import { gitSyncLayout } from './layouts'
import { parseLocaleFilesOptions } from './layouts/locale-files/files'
import type {
  GitSyncLayout,
  GitSyncLayoutContext,
  RemoteFileInfo,
} from './layouts/types'

export function publicGitSyncBinding(row: {
  id: number
  enabled: boolean
  adapter: string
  remoteUrl: string
  branch: string
  product: string
  options: unknown
  credentialKind: string
  token: string
  lastPulledAt: Date | null
  lastPushedAt: Date | null
}) {
  return {
    id: row.id,
    enabled: row.enabled,
    adapter: row.adapter,
    remoteUrl: row.remoteUrl,
    branch: row.branch,
    product: row.product,
    options: row.options ?? null,
    credentialKind: row.credentialKind,
    tokenConfigured: Boolean(row.token),
    lastPulledAt: row.lastPulledAt,
    lastPushedAt: row.lastPushedAt,
  }
}

type BindingLocation = {
  adapter: string
  remoteUrl: string
  branch: string
  product: string
  options: unknown
}

/**
 * True when a binding edit points at different files. Bases and seen files
 * describe the old location, and read against the new one they misclassify:
 * every key pushed before looks deleted on the remote.
 */
export function bindingLocationChanged(
  before: BindingLocation,
  after: BindingLocation
): boolean {
  if (
    before.adapter !== after.adapter ||
    before.remoteUrl !== after.remoteUrl ||
    before.branch !== after.branch ||
    before.product !== after.product
  ) {
    return true
  }
  if (after.adapter !== GitSyncAdapter.LOCALE_FILES) return false
  const a = parseLocaleFilesOptions(before.options)
  const b = parseLocaleFilesOptions(after.options)
  return a.pattern !== b.pattern || a.format !== b.format
}

/**
 * Forgets everything learned from the previous location. Resolved cards stay
 * as history; open cards and pending previews belong to the old files.
 */
export async function resetGitSyncState(
  projectId: number,
  db: Pick<typeof prisma, 'gitSyncBase' | 'gitSyncConflict' | 'gitSyncPreview' | 'gitSyncBinding'>
) {
  await db.gitSyncBase.deleteMany({ where: { projectId } })
  await db.gitSyncConflict.deleteMany({
    where: { projectId, status: GitSyncConflictStatus.OPEN },
  })
  await db.gitSyncPreview.updateMany({
    where: {
      projectId,
      status: {
        in: [GitSyncPreviewStatus.PENDING, GitSyncPreviewStatus.PUSHING],
      },
    },
    data: { status: GitSyncPreviewStatus.CANCELLED },
  })
  await db.gitSyncBinding.update({
    where: { projectId },
    data: { seenFiles: [], generation: { increment: 1 } },
  })
}

/**
 * First read of every apply transaction. An apply whose preview was made under
 * another generation describes files the project no longer syncs. Seen files
 * come from here rather than from before the transaction, so a landing that
 * committed in between is merged instead of overwritten.
 */
async function liveBinding(
  db: Pick<typeof prisma, 'gitSyncBinding'>,
  bindingId: number,
  generation: number
) {
  const live = await db.gitSyncBinding.findUnique({
    where: { id: bindingId },
    select: { generation: true, seenFiles: true },
  })
  if (!live || live.generation !== generation) {
    throw gitSyncError(
      409,
      GitSyncErrorCode.BINDING_CHANGED,
      'Git sync settings changed since the preview — run a new preview'
    )
  }
  return live
}

function localeOverride(
  raw: unknown
): Record<string, string> | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null
  const out: Record<string, string> = {}
  for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
    if (typeof v === 'string') out[k] = v
  }
  return Object.keys(out).length ? out : null
}

/** Narrow view of the Prisma client so helpers work inside `$transaction`. */
type PrismaLike = Pick<
  typeof prisma,
  'i18nKey' | 'localeValue' | 'gitSyncBase' | 'gitSyncConflict'
>

/**
 * Write Git (or a conflict resolution) as the platform copy: draft + published.
 * A written source locale also refreshes the fingerprint — the source language's
 * row is where a key's original text lives.
 */
async function upsertDraft(
  params: {
    projectId: number
    key: string
    locale: string
    text: string
    commitSha: string
    /** The project's source language, resolved by the caller before its transaction. */
    sourceLocale: string
    /**
     * Fingerprint of the source this translation was written against, when
     * known. Defaults to the key's current one.
     */
    sourceFingerprint?: string
  },
  db: PrismaLike = prisma
) {
  const record = await db.i18nKey.upsert({
    where: {
      projectId_key: { projectId: params.projectId, key: params.key },
    },
    create: {
      projectId: params.projectId,
      key: params.key,
      fingerprint:
        params.locale === params.sourceLocale ? fpTranslation(params.text) : '',
    },
    update:
      params.locale === params.sourceLocale
        ? {
            fingerprint: fpTranslation(params.text),
          }
        : {},
  })
  // A key with no source yet has nothing to be outdated against.
  const writtenAgainst =
    params.sourceFingerprint && record.fingerprint
      ? params.sourceFingerprint
      : record.fingerprint
  await db.localeValue.upsert({
    where: {
      i18nKeyId_locale: { i18nKeyId: record.id, locale: params.locale },
    },
    create: {
      i18nKeyId: record.id,
      locale: params.locale,
      draftText: params.text,
      publishedText: params.text,
      ...(params.locale === params.sourceLocale
        ? {}
        : { sourceFingerprint: writtenAgainst }),
    },
    update: {
      draftText: params.text,
      publishedText: params.text,
      ...(params.locale === params.sourceLocale
        ? {}
        : { sourceFingerprint: writtenAgainst }),
    },
  })
}

async function setBase(
  params: {
    projectId: number
    key: string
    locale: string
    text: string
    commitSha: string
  },
  db: PrismaLike = prisma
) {
  await db.gitSyncBase.upsert({
    where: {
      projectId_key_locale: {
        projectId: params.projectId,
        key: params.key,
        locale: params.locale,
      },
    },
    create: {
      projectId: params.projectId,
      key: params.key,
      locale: params.locale,
      baseText: params.text,
      commitSha: params.commitSha,
    },
    update: { baseText: params.text, commitSha: params.commitSha },
  })
}

async function upsertConflict(
  params: {
    projectId: number
    key: string
    locale: string
    baseText: string
    oursText: string
    theirsText: string
    publishedText: string | null
    /** See `GitSyncConflict.olderSourceText`. */
    olderSourceText?: string | null
  },
  db: PrismaLike = prisma
) {
  await db.gitSyncConflict.upsert({
    where: {
      projectId_key_locale: {
        projectId: params.projectId,
        key: params.key,
        locale: params.locale,
      },
    },
    create: {
      ...params,
      status: 'open',
    },
    update: {
      baseText: params.baseText,
      oursText: params.oursText,
      theirsText: params.theirsText,
      publishedText: params.publishedText,
      olderSourceText: params.olderSourceText ?? null,
      status: 'open',
      mergedText: null,
    },
  })
}

function conflictId(key: string, locale: string): string {
  return `${key}\0${locale}`
}

/**
 * Closes open cards a preview just re-examined and no longer finds in
 * conflict. Without this a card whose disagreement Git or the platform has
 * since settled stays open, and one open card refuses every push.
 */
async function closeObsoleteConflicts(
  projectId: number,
  examined: Set<string>,
  conflicting: Set<string>
) {
  const open = await prisma.gitSyncConflict.findMany({
    where: { projectId, status: GitSyncConflictStatus.OPEN },
    select: { id: true, key: true, locale: true },
  })
  const ids = open
    .filter((row) => {
      const id = conflictId(row.key, row.locale)
      return examined.has(id) && !conflicting.has(id)
    })
    .map((row) => row.id)
  if (!ids.length) return
  await prisma.gitSyncConflict.updateMany({
    where: { id: { in: ids }, status: GitSyncConflictStatus.OPEN },
    data: { status: GitSyncConflictStatus.OBSOLETE },
  })
}

type LiveLocaleText = { draftText: string | null; publishedText: string | null }

/**
 * A card records the platform as its preview saw it: the draft for a pull,
 * the trimmed published text for a push. Once neither matches, Git's side or
 * a merge would overwrite an edit nobody compared against.
 */
function conflictStillHolds(oursText: string, live: LiveLocaleText | null) {
  if (!live) return oursText === ''
  return (
    oursText === (live.draftText ?? '') ||
    oursText === (live.publishedText ?? '').trim()
  )
}

/**
 * Open cards, after closing as `obsolete` those whose platform side moved on.
 * Every reader of open cards goes through here, so a stale card neither shows
 * nor blocks.
 */
export async function listOpenConflicts(projectId: number) {
  const open = await prisma.gitSyncConflict.findMany({
    where: { projectId, status: GitSyncConflictStatus.OPEN },
    orderBy: { updatedAt: 'desc' },
  })
  if (!open.length) return open
  const values = await prisma.localeValue.findMany({
    where: {
      i18nKey: { projectId, key: { in: [...new Set(open.map((c) => c.key))] } },
    },
    select: {
      locale: true,
      draftText: true,
      publishedText: true,
      i18nKey: { select: { key: true } },
    },
  })
  const live = new Map(
    values.map((row) => [conflictId(row.i18nKey.key, row.locale), row])
  )
  const stale = new Set(
    open
      .filter(
        (c) =>
          !conflictStillHolds(
            c.oursText,
            live.get(conflictId(c.key, c.locale)) ?? null
          )
      )
      .map((c) => c.id)
  )
  if (!stale.size) return open
  await prisma.gitSyncConflict.updateMany({
    where: { id: { in: [...stale] }, status: GitSyncConflictStatus.OPEN },
    data: { status: GitSyncConflictStatus.OBSOLETE },
  })
  return open.filter((c) => !stale.has(c.id))
}

export async function discoverProducts(params: {
  adapter: string
  remoteUrl: string
  branch: string
  credentialKind: string
  token: string
}) {
  const { discover } = gitSyncLayout(params.adapter)
  if (!discover) {
    throw createError({
      statusCode: 400,
      statusMessage: 'This layout has no folders to list — type the directory instead',
    })
  }
  return withClonedRepo({
    remoteUrl: params.remoteUrl,
    branch: params.branch,
    credentialKind: params.credentialKind,
    token: params.token,
    run: async (repoDir) => discover(repoDir),
  })
}

type ResolvedBinding = Awaited<
  ReturnType<typeof prisma.gitSyncBinding.findUnique>
> & object

/** Shared guard: sync is enabled, scope is sane, remote is set. */
async function requireBinding(projectId: number) {
  const binding = await prisma.gitSyncBinding.findUnique({
    where: { projectId },
  })
  if (!binding?.token || !binding.enabled) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Git sync is not configured',
    })
  }
  const layout = gitSyncLayout(binding.adapter)
  const scopeError = layout.scopeError(binding.product, binding.options)
  if (scopeError) {
    throw createError({ statusCode: 400, statusMessage: scopeError })
  }
  const remoteUrl = binding.remoteUrl.trim()
  if (!remoteUrl) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Remote URL is missing',
    })
  }
  return { binding: binding as ResolvedBinding, layout, remoteUrl }
}

function layoutContext(
  projectId: number,
  binding: ResolvedBinding,
  repoRoot: string
): GitSyncLayoutContext {
  return {
    repoRoot,
    scope: binding.product,
    options: binding.options,
    localeMap: localeOverride(binding.localeMap),
    loadLocales: () => projectLocales(projectId),
  }
}

export type PullCandidate = {
  key: string
  locale: string
  relPath: string
  baseText: string
  oursText: string
  theirsText: string
  publishedText: string | null
  decision: ThreeWayDecision
  /**
   * The source text this translation was written against, when the layout
   * records it (LILT pairs by batch id). Null for the source locale, or when
   * unknown. Apply records its fingerprint as the translation's
   * `sourceFingerprint`, so a translation of an older source shows outdated.
   */
  writtenAgainst: string | null
  /** `writtenAgainst` is not the key's source any more: a newer batch is still out. */
  staleSource: boolean
}

export type PullPreview = {
  previewId: number
  commitSha: string
  expiresAt: Date
  files: RemoteFileInfo[]
  candidates: PullCandidate[]
  counts: Record<ThreeWayDecision, number>
  /** Locales present in Git that the project does not have; never pulled. */
  ignoredLocales: string[]
}

/**
 * Step 1 of pull: clone once, classify files, run the three-way decision for
 * every key+locale, and persist the result as a pending preview. Writes
 * nothing to the translation tables.
 */
export async function previewPull(
  projectId: number,
  createdBy: string
): Promise<PullPreview> {
  const { binding, layout, remoteUrl } = await requireBinding(projectId)
  const seen = seenFileMap(binding.seenFiles)
  return withClonedRepo({
    remoteUrl,
    branch: binding.branch,
    credentialKind: binding.credentialKind,
    token: binding.token,
    sparsePath: binding.product,
    run: async (repoDir, commitSha) => {
      const ctx = layoutContext(projectId, binding, repoDir)
      const files = await layout.listFiles(ctx, seen)
      // Merge every file so a seen file that still disagrees with the last
      // landing (Git ahead, platform unchanged) shows up as apply-theirs —
      // otherwise it is skipped on Push and invisible on Pull.
      const {
        candidates: allCandidates,
        examined,
        ignoredLocales,
      } = await buildPullCandidates(projectId, layout, ctx, files)
      const candidates = allCandidates.filter(
        (c) => c.decision === 'apply-theirs' || c.decision === 'conflict'
      )
      const counts = countDecisions(candidates)
      const expiresAt = new Date(Date.now() + GIT_SYNC_PREVIEW_TTL_MS)
      await prisma.gitSyncPreview.updateMany({
        where: {
          projectId,
          kind: GitSyncPreviewKind.PULL,
          status: GitSyncPreviewStatus.PENDING,
        },
        data: { status: GitSyncPreviewStatus.CANCELLED },
      })
      const preview = await prisma.gitSyncPreview.create({
        data: {
          projectId,
          kind: GitSyncPreviewKind.PULL,
          status: GitSyncPreviewStatus.PENDING,
          commitSha,
          createdBy,
          expiresAt,
          candidates: {
            files,
            candidates,
            scopeTree: await treeSha(repoDir, binding.product),
            generation: binding.generation,
          } as object,
        },
      })
      const conflicting = new Set<string>()
      for (const c of candidates) {
        if (c.decision !== 'conflict') continue
        conflicting.add(conflictId(c.key, c.locale))
        await upsertConflict({
          projectId,
          key: c.key,
          locale: c.locale,
          baseText: c.baseText,
          oursText: c.oursText,
          theirsText: c.theirsText,
          publishedText: c.publishedText,
          olderSourceText: c.staleSource ? c.writtenAgainst : null,
        })
      }
      await closeObsoleteConflicts(projectId, examined, conflicting)
      return {
        previewId: preview.id,
        commitSha,
        expiresAt,
        files,
        candidates,
        counts,
        ignoredLocales,
      }
    },
  })
}

function countDecisions(
  candidates: PullCandidate[]
): Record<ThreeWayDecision, number> {
  const counts: Record<ThreeWayDecision, number> = {
    'apply-theirs': 0,
    'keep-ours': 0,
    align: 0,
    conflict: 0,
  }
  for (const c of candidates) counts[c.decision] += 1
  return counts
}

async function buildPullCandidates(
  projectId: number,
  layout: GitSyncLayout,
  ctx: GitSyncLayoutContext,
  files: RemoteFileInfo[]
): Promise<{
  candidates: PullCandidate[]
  /** Every remote key+locale this pull looked at, whatever it decided. */
  examined: Set<string>
  ignoredLocales: string[]
}> {
  const { maps: remote, origin } = await layout.readLocales(ctx, files)
  const sourceLocale = await sourceLocaleOf(projectId)
  const sourceTextFor = await layout.sourceTextFor(ctx, files, sourceLocale)
  // A project with no locale list configured keeps the old pull-everything rule.
  const locales = new Set(await projectLocales(projectId))
  const keys = await prisma.i18nKey.findMany({
    where: { projectId },
    include: { locales: true },
  })
  const keyByName = new Map(keys.map((k) => [k.key, k]))
  const bases = await prisma.gitSyncBase.findMany({ where: { projectId } })
  const baseMap = new Map(
    bases.map((b) => [`${b.key}\0${b.locale}`, b.baseText])
  )
  const out: PullCandidate[] = []
  const examined = new Set<string>()
  const ignoredLocales: string[] = []
  for (const [locale, map] of remote) {
    if (locales.size && !locales.has(locale)) {
      ignoredLocales.push(locale)
      continue
    }
    for (const [key, theirs] of map) {
      if (key.startsWith(DRAFT_KEY_PREFIX)) continue
      examined.add(conflictId(key, locale))
      const row = keyByName.get(key)
      const loc = row?.locales.find((l) => l.locale === locale)
      const ours = loc?.draftText ?? null
      const base = baseMap.get(`${key}\0${locale}`) ?? null
      const decision = classifyPull({
        ours,
        theirs,
        base,
        gitSyncEnabled: row?.gitSyncEnabled ?? true,
      })
      // A key kept out of Git sync takes no part at all.
      if (decision === null) continue
      const relPath = origin.get(`${locale}\0${key}`) ?? ''
      out.push({
        key,
        locale,
        relPath,
        baseText: base ?? '',
        oursText: ours ?? '',
        theirsText: theirs,
        publishedText: loc?.publishedText ?? null,
        decision,
        writtenAgainst:
          locale === sourceLocale ? null : sourceTextFor(relPath, key),
        staleSource: false,
      })
    }
  }
  flagStaleSources(
    out,
    sourceLocale,
    new Map(keys.map((k) => [k.key, k.fingerprint]))
  )
  return { candidates: out, examined, ignoredLocales: ignoredLocales.sort() }
}

async function loadPendingPreview(
  projectId: number,
  previewId: number,
  kind: GitSyncPreviewKind
) {
  const preview = await prisma.gitSyncPreview.findFirst({
    where: { id: previewId, projectId, kind },
  })
  if (!preview) {
    throw createError({ statusCode: 404, statusMessage: 'Preview not found' })
  }
  // Retrying an interrupted push is how its commit gets found and recorded, so
  // neither the status nor the expiry may turn it away.
  if (preview.status === GitSyncPreviewStatus.PUSHING) return preview
  if (preview.status === GitSyncPreviewStatus.APPLIED) {
    throw gitSyncError(
      409,
      GitSyncErrorCode.PREVIEW_APPLIED,
      'Preview already applied — run a new preview'
    )
  }
  if (preview.status !== GitSyncPreviewStatus.PENDING) {
    // A newer preview cancels the pending one, and it may be someone else's.
    const newer = await prisma.gitSyncPreview.findFirst({
      where: { projectId, kind, id: { gt: preview.id } },
      select: { createdBy: true },
    })
    throw newer
      ? gitSyncError(
          409,
          GitSyncErrorCode.PREVIEW_REPLACED,
          `A newer preview by ${newer.createdBy || 'someone'} replaced this one — run a new preview`
        )
      : gitSyncError(
          409,
          GitSyncErrorCode.PREVIEW_INVALID,
          'Preview is no longer valid — run a new preview'
        )
  }
  if (preview.expiresAt.getTime() < Date.now()) {
    await prisma.gitSyncPreview.update({
      where: { id: preview.id },
      data: { status: GitSyncPreviewStatus.CANCELLED },
    })
    throw gitSyncError(
      409,
      GitSyncErrorCode.PREVIEW_INVALID,
      'Preview expired — run a new preview'
    )
  }
  return preview
}

/**
 * Step 3 of pull. The stored snapshot is reused only if the bound folder is
 * unchanged on the remote, and each selected row is decided again against the
 * platform as it is now: a row whose platform side moved since the preview is
 * kept, not overwritten, and reported in `changed`. Rows whose key still has
 * an open conflict card are skipped and reported in `blocked`.
 */
type ApplyPullParams = {
  projectId: number
  previewId: number
  selectedFiles: string[]
  selectedKeys: string[]
  /** Shown to anyone refused while this apply holds the lease. */
  triggeredBy: string
  userId?: number | null
}

export async function applyPull(params: ApplyPullParams) {
  return withSyncLease(params.projectId, params.triggeredBy, () =>
    applyPullUnderLease(params)
  )
}

async function applyPullUnderLease(params: ApplyPullParams) {
  const { projectId, previewId } = params
  const { binding, remoteUrl } = await requireBinding(projectId)
  const preview = await loadPendingPreview(
    projectId,
    previewId,
    GitSyncPreviewKind.PULL
  )
  const snapshot = preview.candidates as unknown as {
    files: RemoteFileInfo[]
    candidates: PullCandidate[]
    /** Tree id of the bound folder at preview; absent on older previews. */
    scopeTree?: string | null
    /** Absent on previews made before generations existed. */
    generation?: number
  }
  const generation = snapshot.generation ?? binding.generation
  const head = await remoteHeadSha({
    remoteUrl,
    branch: binding.branch,
    credentialKind: binding.credentialKind,
    token: binding.token,
  })
  // A commit elsewhere in the repo (another LILT product) moves the head but
  // not the bound folder. Only a changed folder invalidates the snapshot.
  const folderUnchanged =
    head === preview.commitSha ||
    (snapshot.scopeTree != null &&
      (await withClonedRepo({
        remoteUrl,
        branch: binding.branch,
        credentialKind: binding.credentialKind,
        token: binding.token,
        sparsePath: binding.product,
        run: (repoDir) => treeSha(repoDir, binding.product),
      })) === snapshot.scopeTree)
  if (!folderUnchanged) {
    await prisma.gitSyncPreview.update({
      where: { id: preview.id },
      data: { status: GitSyncPreviewStatus.CANCELLED },
    })
    throw gitSyncError(
      409,
      GitSyncErrorCode.REMOTE_MOVED,
      'Remote changed since preview — run a new preview'
    )
  }
  const fileFilter = new Set(params.selectedFiles)
  const keyFilter = new Set(params.selectedKeys)
  const chosenFiles = snapshot.files.filter((f) => fileFilter.has(f.relPath))
  const selected = snapshot.candidates.filter(
    (c) => keyFilter.has(`${c.key}\0${c.locale}`) && c.decision !== 'conflict'
  )
  if (!selected.length) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Nothing selected to pull',
    })
  }
  // A key with an open card in any locale sits out: landing its translations
  // while its source is undecided would record them against the wrong source.
  const openCards = await listOpenConflicts(projectId)
  const conflictedKeys = new Set(openCards.map((row) => row.key))
  const blocked = selected
    .filter((c) => conflictedKeys.has(c.key))
    .map((c) => ({ key: c.key, locale: c.locale }))
  const chosen = selected.filter((c) => !conflictedKeys.has(c.key))
  if (!chosen.length) {
    throw gitSyncError(
      409,
      GitSyncErrorCode.CONFLICT_OPEN,
      `Resolve the conflicts on ${conflictedKeys.size} key(s) before applying these rows`
    )
  }
  const commitSha = head
  // Resolved before the transaction on purpose: Prisma's SQLite client holds the
  // one connection open inside it, so a query out there could only wait.
  const sourceLocale = await sourceLocaleOf(projectId)
  let applied = 0
  let aligned = 0
  const changed: { key: string; locale: string }[] = []
  await prisma.$transaction(async (tx) => {
    const live = await liveBinding(tx, binding.id, generation)
    // The snapshot only vouches for Git. The platform side is read again here:
    // a key edited after the preview must not be overwritten with Git's text.
    const liveKeys = await tx.i18nKey.findMany({
      where: { projectId },
      select: {
        key: true,
        gitSyncEnabled: true,
        locales: { select: { locale: true, draftText: true } },
      },
    })
    const liveByKey = new Map(liveKeys.map((row) => [row.key, row]))
    const liveBases = await tx.gitSyncBase.findMany({ where: { projectId } })
    const liveBase = new Map(
      liveBases.map((row) => [conflictId(row.key, row.locale), row.baseText])
    )
    const ordered = [...chosen].sort((a, b) => {
      const aSource = a.locale === sourceLocale ? 0 : 1
      const bSource = b.locale === sourceLocale ? 0 : 1
      return aSource - bSource
    })
    for (const c of ordered) {
      const row = liveByKey.get(c.key)
      const decision = classifyPull({
        ours: row?.locales.find((l) => l.locale === c.locale)?.draftText ?? null,
        theirs: c.theirsText,
        base: liveBase.get(conflictId(c.key, c.locale)) ?? null,
        gitSyncEnabled: row?.gitSyncEnabled ?? true,
      })
      switch (decision) {
        case 'apply-theirs':
          // Preview already confirmed Git. Land it as the platform copy
          // (draft + published) so Apply is not a third staging area.
          await upsertDraft(
            {
              projectId,
              key: c.key,
              locale: c.locale,
              text: c.theirsText,
              commitSha,
              sourceLocale,
              sourceFingerprint:
                c.writtenAgainst != null ? fpTranslation(c.writtenAgainst) : undefined,
            },
            tx
          )
          await setBase(
            { projectId, key: c.key, locale: c.locale, text: c.theirsText, commitSha },
            tx
          )
          applied += 1
          break
        case 'align':
          await setBase(
            { projectId, key: c.key, locale: c.locale, text: c.theirsText, commitSha },
            tx
          )
          aligned += 1
          break
        case 'keep-ours':
        case 'conflict':
        case null:
          changed.push({ key: c.key, locale: c.locale })
          break
        default: {
          const _exhaustive: never = decision
          return _exhaustive
        }
      }
    }
    const kept = changed.length
    // Only files the user actually accepted are marked seen, so skipping a
    // file now leaves it a candidate next time instead of hiding it forever.
    const seen = seenFileMap(live.seenFiles)
    for (const f of chosenFiles) seen.set(f.relPath, f.sha)
    await tx.gitSyncBinding.update({
      where: { id: binding.id },
      data: {
        lastPulledAt: new Date(),
        seenFiles: [...seen].map(([path, sha]) => ({ path, sha })),
      },
    })
    await tx.gitSyncPreview.update({
      where: { id: preview.id },
      data: {
        status: GitSyncPreviewStatus.APPLIED,
        result: { applied, aligned, kept, blocked: blocked.length } as object,
      },
    })
    await writeGitSyncLog(
      {
        projectId,
        action: GitSyncLogAction.PULL_APPLY,
        status: kept || blocked.length
          ? GitSyncLogStatus.PARTIAL
          : GitSyncLogStatus.SUCCESS,
        previewId: preview.id,
        commitSha,
        detail: {
          applied,
          aligned,
          kept,
          blocked: blocked.length,
          files: chosenFiles.length,
        },
        userId: params.userId,
      },
      tx
    )
  })
  return {
    applied,
    aligned,
    kept: changed.length,
    /** Edited on the platform after the preview, so left as they are. */
    changed,
    /** Selected, but their key has an open conflict card. */
    blocked,
    files: chosenFiles.length,
  }
}

export type PushCandidate = {
  key: string
  baseText: string
  text: string
  theirsText: string
  reason: GitSyncPushReason
  eligible: boolean
}

export type PushApplyResult = {
  filename: string
  count: number
  pushed: boolean
  reconciled: boolean
  skipped: { key: string; reason: GitSyncPushReason }[]
  conflicts: number
}

export type PushPreview = {
  previewId: number
  sourceLocale: string
  expiresAt: Date
  candidates: PushCandidate[]
  counts: Record<GitSyncPushReason, number>
}

/**
 * Step 1 of push. Clones `source/` so the proposal can three-way against the
 * live remote, then returns every source key with the reason it is or is not
 * proposed. An empty delta is explainable instead of a bare 400.
 */
export async function previewPush(
  projectId: number,
  createdBy: string
): Promise<PushPreview> {
  const { binding, layout, remoteUrl } = await requireBinding(projectId)
  const sourceLocal = await sourceLocaleOf(projectId)
  // Keys kept out of Git sync never enter the candidate loop. Filtering the
  // query rather than adding a push reason keeps the reason counts, the
  // eligibility rules and the UI's reason filters untouched.
  const keys = await prisma.i18nKey.findMany({
    where: { projectId, gitSyncEnabled: true },
    include: { locales: true },
  })
  const interrupted = await prisma.gitSyncPreview.findMany({
    where: {
      projectId,
      kind: GitSyncPreviewKind.PUSH,
      status: GitSyncPreviewStatus.PUSHING,
    },
    select: { id: true, result: true },
  })
  return withClonedRepo({
    remoteUrl,
    branch: binding.branch,
    credentialKind: binding.credentialKind,
    token: binding.token,
    sparsePath: binding.product,
    // History is only needed to find an interrupted push's commit.
    ...(interrupted.length ? { depth: GIT_SYNC_PUSH_CLONE_DEPTH } : {}),
    run: async (repoDir, commitSha) => {
      const ctx = layoutContext(projectId, binding, repoDir)
      if (interrupted.length) {
        await reconcileInterruptedPushes({
          projectId,
          createdBy,
          binding,
          layout,
          ctx,
          sourceLocal,
          interrupted,
        }).catch((error: unknown) => {
          // Someone is applying right now; their own bookkeeping covers it.
          if (gitSyncErrorCode(error) !== GitSyncErrorCode.SYNC_BUSY) throw error
        })
        await checkoutCommit(repoDir, commitSha)
      }
      // Read after the reconcile, which may have moved bases up.
      const bases = await prisma.gitSyncBase.findMany({
        where: { projectId, locale: sourceLocal },
      })
      const lastPushed = new Map(bases.map((row) => [row.key, row.baseText]))
      const remote = await layout.readSource(ctx, sourceLocal)
      const candidates: PushCandidate[] = []
      for (const key of keys) {
        const loc = key.locales.find((l) => l.locale === sourceLocal)
        const text = loc?.publishedText?.trim() ?? ''
        const baseText = lastPushed.get(key.key) ?? ''
        const theirsText = remote.get(key.key) ?? ''
        const reason = classifyPush(key.key, text, lastPushed, remote)
        candidates.push({
          key: key.key,
          baseText,
          text,
          theirsText,
          reason,
          eligible: isPushEligible(reason),
        })
      }
      const unwritable = await layout.unwritableKeys(
        ctx,
        sourceLocal,
        candidates.filter((c) => isPushSelectable(c.reason)).map((c) => c.key)
      )
      for (const c of candidates) {
        if (!unwritable.has(c.key)) continue
        c.reason = GitSyncPushReason.UNWRITABLE
        c.eligible = false
      }
      candidates.sort((a, b) => a.key.localeCompare(b.key))
      const counts = emptyPushCounts()
      for (const c of candidates) counts[c.reason] += 1
      const conflictKeys = candidates
        .filter((c) => c.reason === GitSyncPushReason.CONFLICT)
        .map((c) => c.key)
      await closeObsoleteConflicts(
        projectId,
        new Set(candidates.map((c) => conflictId(c.key, sourceLocal))),
        new Set(conflictKeys.map((key) => conflictId(key, sourceLocal)))
      )
      // Cards this preview raises itself are shown in it; any other open card
      // still has to be resolved first.
      const ownKeys = new Set(conflictKeys)
      const openCount = (await listOpenConflicts(projectId)).filter(
        (c) => !(c.locale === sourceLocal && ownKeys.has(c.key))
      ).length
      if (openCount > 0) {
        throw gitSyncError(
          409,
          GitSyncErrorCode.CONFLICT_OPEN,
          `Resolve ${openCount} open conflict(s) before push`
        )
      }
      const expiresAt = new Date(Date.now() + GIT_SYNC_PREVIEW_TTL_MS)
      await prisma.gitSyncPreview.updateMany({
        where: {
          projectId,
          kind: GitSyncPreviewKind.PUSH,
          status: GitSyncPreviewStatus.PENDING,
        },
        data: { status: GitSyncPreviewStatus.CANCELLED },
      })
      const preview = await prisma.gitSyncPreview.create({
        data: {
          projectId,
          kind: GitSyncPreviewKind.PUSH,
          status: GitSyncPreviewStatus.PENDING,
          commitSha,
          createdBy,
          expiresAt,
          candidates: {
            sourceLocale: sourceLocal,
            candidates,
            generation: binding.generation,
          } as object,
        },
      })
      for (const c of candidates) {
        if (c.reason !== GitSyncPushReason.CONFLICT) continue
        await upsertConflict({
          projectId,
          key: c.key,
          locale: sourceLocal,
          baseText: c.baseText,
          oursText: c.text,
          theirsText: c.theirsText,
          publishedText: c.text || null,
        })
      }
      return {
        previewId: preview.id,
        sourceLocale: sourceLocal,
        expiresAt,
        candidates,
        counts,
      }
    },
  })
}

/**
 * Step 3 of push. Source text is re-read from the database rather than taken
 * from the snapshot, so a key edited after the preview is either pushed at
 * its current value or reported as skipped — never written back stale.
 */
type ApplyPushParams = {
  projectId: number
  previewId: number
  selectedKeys: string[]
  triggeredBy: string
  userId?: number | null
}

export async function applyPush(params: ApplyPushParams) {
  return withSyncLease(params.projectId, params.triggeredBy, () =>
    applyPushUnderLease(params)
  )
}

async function applyPushUnderLease(params: ApplyPushParams) {
  const { projectId, previewId } = params
  const openCount = (await listOpenConflicts(projectId)).length
  if (openCount > 0) {
    throw gitSyncError(
      409,
      GitSyncErrorCode.CONFLICT_OPEN,
      `Resolve ${openCount} open conflict(s) before push`
    )
  }
  const { binding, layout, remoteUrl } = await requireBinding(projectId)
  const preview = await loadPendingPreview(
    projectId,
    previewId,
    GitSyncPreviewKind.PUSH
  )
  const snapshot = preview.candidates as unknown as {
    sourceLocale: string
    candidates: PushCandidate[]
    /** Absent on previews made before generations existed. */
    generation?: number
  }
  const generation = snapshot.generation ?? binding.generation
  if (generation !== binding.generation) {
    throw gitSyncError(
      409,
      GitSyncErrorCode.BINDING_CHANGED,
      'Git sync settings changed since the preview — run a new preview'
    )
  }
  const sourceLocal = snapshot.sourceLocale
  const selected = new Set(params.selectedKeys)
  // Same filter as the preview: a key switched off between preview and apply
  // simply drops out of the overlay instead of being pushed anyway.
  const rows = await prisma.i18nKey.findMany({
    where: { projectId, gitSyncEnabled: true },
    include: { locales: { where: { locale: sourceLocal } } },
  })
  const bases = await prisma.gitSyncBase.findMany({
    where: { projectId, locale: sourceLocal },
  })
  const lastPushed = new Map(bases.map((row) => [row.key, row.baseText]))
  // Deliberately *not* mirroring pull's strict sha check. An unrelated commit
  // after preview does not invalidate the selection — we re-read live source/
  // and three-way again. The race that does matter, a non-fast-forward at
  // push time, is caught by `commitAndPush` and surfaced as a 409.
  const trailer = `Localness-Preview: ${preview.id}`
  return withClonedRepo({
    remoteUrl,
    branch: binding.branch,
    credentialKind: binding.credentialKind,
    token: binding.token,
    sparsePath: binding.product,
    depth: GIT_SYNC_PUSH_CLONE_DEPTH,
    run: async (repoDir) => {
      const ctx = layoutContext(projectId, binding, repoDir)
      const orphan = await findCommitByTrailer(repoDir, trailer)
      if (orphan) {
        // The base is what that commit holds, not today's published text: a key
        // edited since the batch landed must still read as changed next push.
        await checkoutCommit(repoDir, orphan)
        const landed = await layout.readSource(ctx, sourceLocal)
        const overlay: Record<string, string> = {}
        for (const row of rows) {
          if (!selected.has(row.key) || row.key.startsWith(DRAFT_KEY_PREFIX)) continue
          const text = landed.get(row.key)
          if (text) overlay[row.key] = text
        }
        const result: PushApplyResult = {
          filename: '',
          count: Object.keys(overlay).length,
          pushed: true,
          reconciled: true,
          skipped: [],
          conflicts: 0,
        }
        await recordPushLanding({
          binding,
          projectId,
          previewId: preview.id,
          sourceLocal,
          overlay,
          commitSha: orphan,
          batchPath: null,
          batchSha: '',
          result,
          userId: params.userId,
        })
        return result
      }
      const remote = await layout.readSource(ctx, sourceLocal)
      const wanted: Record<string, string> = {}
      const skipped: { key: string; reason: GitSyncPushReason }[] = []
      const conflictRows: {
        key: string
        baseText: string
        oursText: string
        theirsText: string
        publishedText: string | null
      }[] = []
      for (const row of rows) {
        const text = row.locales[0]?.publishedText?.trim() ?? ''
        const reason = classifyPush(row.key, text, lastPushed, remote)
        const picked = selected.has(row.key)
        switch (reason) {
          case GitSyncPushReason.NEW_KEY:
          case GitSyncPushReason.CHANGED:
            if (picked) wanted[row.key] = text
            break
          case GitSyncPushReason.CONFLICT:
            skipped.push({ key: row.key, reason })
            conflictRows.push({
              key: row.key,
              baseText: lastPushed.get(row.key) ?? '',
              oursText: text,
              theirsText: remote.get(row.key) ?? '',
              publishedText: text || null,
            })
            break
          case GitSyncPushReason.REMOTE_CHANGED:
            if (picked) wanted[row.key] = text
            break
          case GitSyncPushReason.UNCHANGED:
          case GitSyncPushReason.NOT_PUBLISHED:
          case GitSyncPushReason.DRAFT_KEY:
          case GitSyncPushReason.UNWRITABLE:
            if (picked) skipped.push({ key: row.key, reason })
            break
          default: {
            const _exhaustive: never = reason
            return _exhaustive
          }
        }
      }
      const unwritable = await layout.unwritableKeys(
        ctx,
        sourceLocal,
        Object.keys(wanted)
      )
      for (const key of unwritable) {
        skipped.push({ key, reason: GitSyncPushReason.UNWRITABLE })
      }
      const overlay = Object.fromEntries(
        Object.entries(wanted).filter(([key]) => !unwritable.has(key))
      )
      if (!Object.keys(overlay).length) {
        await prisma.$transaction(async (tx) => {
          for (const row of conflictRows) {
            await upsertConflict(
              { projectId, locale: sourceLocal, ...row },
              tx
            )
          }
          await tx.gitSyncPreview.update({
            where: { id: preview.id },
            data: {
              status: GitSyncPreviewStatus.CANCELLED,
              result: { skipped, conflicts: conflictRows.length } as object,
            },
          })
          await writeGitSyncLog(
            {
              projectId,
              action: GitSyncLogAction.PUSH_APPLY,
              status: conflictRows.length
                ? GitSyncLogStatus.REFUSED
                : GitSyncLogStatus.FAILED,
              previewId: preview.id,
              detail: {
                filename: '',
                count: 0,
                keys: [],
                reconciled: false,
                skipped: countSkipReasons(skipped),
                conflicts: conflictRows.length,
              },
              userId: params.userId,
            },
            tx
          )
        })
        if (conflictRows.length) {
          throw gitSyncError(
            409,
            GitSyncErrorCode.CONFLICT_OPEN,
            'Remote source diverged — resolve conflicts on /git'
          )
        }
        throw createError({
          statusCode: 400,
          statusMessage: 'Nothing selected to push',
        })
      }
      const written = await layout.writeSource(ctx, sourceLocal, overlay)
      const filename = basename(written.relPath)
      // From here the commit may land without its bookkeeping. The keys are
      // what a later reconcile reads back out of that commit.
      await prisma.gitSyncPreview.update({
        where: { id: preview.id },
        data: {
          status: GitSyncPreviewStatus.PUSHING,
          result: { keys: Object.keys(overlay) },
        },
      })
      const pushed = await commitAndPush({
        repoDir,
        message: `localness: ${written.summary} (by ${params.triggeredBy})\n\n${trailer}`,
        authorName: 'Localness Git Sync',
      }).catch(async (error: unknown) => {
        // A rejected push certainly did not land; there is nothing to reconcile.
        if (gitSyncErrorCode(error) === GitSyncErrorCode.REMOTE_MOVED) {
          await prisma.gitSyncPreview.update({
            where: { id: preview.id },
            data: { status: GitSyncPreviewStatus.CANCELLED },
          })
        }
        throw error
      })
      if (!pushed.pushed) {
        await prisma.gitSyncPreview.update({
          where: { id: preview.id },
          data: { status: GitSyncPreviewStatus.PENDING },
        })
      }
      const result: PushApplyResult = {
        filename,
        count: Object.keys(overlay).length,
        pushed: pushed.pushed,
        reconciled: false,
        skipped,
        conflicts: conflictRows.length,
      }
      if (pushed.pushed) {
        await recordPushLanding({
          binding,
          projectId,
          previewId: preview.id,
          sourceLocal,
          overlay,
          commitSha: pushed.commitSha,
          batchPath: written.relPath,
          batchSha: written.sha,
          result,
          conflictRows,
          userId: params.userId,
        })
      }
      return result
    },
  })
}

/**
 * Settles pushes left `pushing` by an apply that died between commit and
 * bookkeeping: found by trailer, they are recorded with what that commit holds;
 * not found, they never landed. Holds the lease so it never races the apply
 * it is cleaning up after. Leaves the clone checked out at an older commit.
 */
async function reconcileInterruptedPushes(params: {
  projectId: number
  createdBy: string
  binding: ResolvedBinding
  layout: GitSyncLayout
  ctx: GitSyncLayoutContext
  sourceLocal: string
  interrupted: { id: number; result: unknown }[]
}) {
  const { projectId, ctx, sourceLocal } = params
  await withSyncLease(projectId, params.createdBy, async () => {
    for (const preview of params.interrupted) {
      const live = await prisma.gitSyncPreview.findUnique({
        where: { id: preview.id },
        select: { status: true },
      })
      if (live?.status !== GitSyncPreviewStatus.PUSHING) continue
      const sha = await findCommitByTrailer(
        ctx.repoRoot,
        `Localness-Preview: ${preview.id}`
      )
      if (!sha) {
        await prisma.gitSyncPreview.update({
          where: { id: preview.id },
          data: { status: GitSyncPreviewStatus.CANCELLED },
        })
        continue
      }
      await checkoutCommit(ctx.repoRoot, sha)
      const landed = await params.layout.readSource(ctx, sourceLocal)
      const stored = preview.result as { keys?: unknown } | null
      const keys = Array.isArray(stored?.keys) ? stored.keys : []
      const overlay: Record<string, string> = {}
      for (const key of keys) {
        const text = typeof key === 'string' ? landed.get(key) : undefined
        if (text) overlay[key as string] = text
      }
      await recordPushLanding({
        binding: params.binding,
        projectId,
        previewId: preview.id,
        sourceLocal,
        overlay,
        commitSha: sha,
        batchPath: null,
        batchSha: '',
        result: {
          filename: '',
          count: Object.keys(overlay).length,
          pushed: true,
          reconciled: true,
          skipped: [],
          conflicts: 0,
        },
        userId: null,
      })
    }
  })
}

/**
 * Bookkeeping for a batch that is already on the remote: mark the files seen,
 * move the three-way base up to what we published, and close out the preview.
 */
async function recordPushLanding(params: {
  binding: { id: number; generation: number }
  projectId: number
  previewId: number
  sourceLocal: string
  overlay: Record<string, string>
  commitSha: string
  batchPath: string | null
  /** Blob sha of the written file; `''` = seen, content unknown. */
  batchSha: string
  result: PushApplyResult
  conflictRows?: {
    key: string
    baseText: string
    oursText: string
    theirsText: string
    publishedText: string | null
  }[]
  userId?: number | null
}) {
  await prisma.$transaction(async (tx) => {
    const live = await liveBinding(
      tx,
      params.binding.id,
      params.binding.generation
    )
    const data: { lastPushedAt: Date; seenFiles?: object } = {
      lastPushedAt: new Date(),
    }
    if (params.batchPath) {
      const seen = seenFileMap(live.seenFiles)
      seen.set(params.batchPath, params.batchSha)
      data.seenFiles = [...seen].map(([path, sha]) => ({ path, sha }))
    }
    await tx.gitSyncBinding.update({
      where: { id: params.binding.id },
      data,
    })
    for (const [key, text] of Object.entries(params.overlay)) {
      await setBase(
        {
          projectId: params.projectId,
          key,
          locale: params.sourceLocal,
          text,
          commitSha: params.commitSha,
        },
        tx
      )
    }
    for (const row of params.conflictRows ?? []) {
      await upsertConflict(
        {
          projectId: params.projectId,
          locale: params.sourceLocal,
          ...row,
        },
        tx
      )
    }
    await tx.gitSyncPreview.update({
      where: { id: params.previewId },
      data: {
        status: GitSyncPreviewStatus.APPLIED,
        commitSha: params.commitSha,
        result: params.result as object,
      },
    })
    const { result } = params
    await writeGitSyncLog(
      {
        projectId: params.projectId,
        action: GitSyncLogAction.PUSH_APPLY,
        status:
          result.skipped.length || result.conflicts
            ? GitSyncLogStatus.PARTIAL
            : GitSyncLogStatus.SUCCESS,
        previewId: params.previewId,
        commitSha: params.commitSha,
        detail: {
          filename: result.filename,
          count: result.count,
          keys: Object.keys(params.overlay),
          reconciled: result.reconciled,
          skipped: countSkipReasons(result.skipped),
          conflicts: result.conflicts,
        },
        userId: params.userId,
      },
      tx
    )
  })
}

/**
 * Moves the platform's copy of a conflicted key to `newKey` and takes it out of
 * Git sync, leaving the remote's copy of the old name exactly where it is.
 *
 * The `Tag.i18nKey` follow-up is not optional: the drawn boxes render from that
 * denormalised column, and saving one of them would post the old name back
 * through `resolveTagI18n`, which upserts by name — re-creating the very key
 * this just moved away from.
 */
async function renameKeyOutOfSync(
  params: {
    projectId: number
    key: string
    newKey?: string
  },
  db: Pick<typeof prisma, 'i18nKey' | 'tag'>
): Promise<string> {
  const newKey = params.newKey?.trim()
  if (!newKey) {
    throw createError({
      statusCode: 400,
      statusMessage: 'renamed action requires newKey',
    })
  }
  const row = await db.i18nKey.findFirst({
    where: { projectId: params.projectId, key: params.key },
    select: { id: true },
  })
  // The platform side can already be gone — a key deleted after the conflict
  // was raised. Nothing to move then, but the conflict still has to close, and
  // the caller's `setBase` is what keeps the remote name from coming back.
  if (!row) return newKey

  const clash = await db.i18nKey.findFirst({
    where: {
      projectId: params.projectId,
      key: newKey,
      id: { not: row.id },
    },
    select: { id: true },
  })
  if (clash) {
    throw createError({
      statusCode: 400,
      statusMessage: `"${newKey}" is already used in this project`,
    })
  }

  await db.i18nKey.update({
    where: { id: row.id },
    data: { key: newKey, gitSyncEnabled: false },
  })
  await db.tag.updateMany({
    where: { i18nKeyId: row.id },
    data: { i18nKey: newKey },
  })
  return newKey
}

export async function resolveConflict(params: {
  projectId: number
  conflictId: number
  action: 'ours' | 'theirs' | 'merged' | 'renamed'
  text?: string
  /** Only for `renamed`: the name the platform's key moves to. */
  newKey?: string
  commitSha?: string
  userId?: number | null
}) {
  const conflict = await prisma.gitSyncConflict.findFirst({
    where: { id: params.conflictId, projectId: params.projectId },
  })
  if (!conflict) {
    throw createError({
      statusCode: 404,
      statusMessage: 'Conflict not found',
    })
  }
  if (conflict.status !== GitSyncConflictStatus.OPEN) {
    throw gitSyncError(
      409,
      GitSyncErrorCode.CONFLICT_RESOLVED,
      'Conflict already resolved'
    )
  }
  if (params.action === 'merged' && params.text == null) {
    throw createError({
      statusCode: 400,
      statusMessage: 'merged action requires text',
    })
  }
  if (params.action === 'theirs' && !conflict.theirsText) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Git has no text for this key — use platform or edit instead',
    })
  }
  // Resolved before the transaction: Prisma's SQLite client holds its one
  // connection inside it.
  const sourceLocale = await sourceLocaleOf(params.projectId)
  const commitSha = params.commitSha ?? ''
  const resolved = await prisma.$transaction(async (tx) => {
    // Claiming the card first makes a second, concurrent resolve a 409
    // instead of a second write.
    const claimed = await tx.gitSyncConflict.updateMany({
      where: { id: conflict.id, status: GitSyncConflictStatus.OPEN },
      data: { status: params.action },
    })
    if (!claimed.count) {
      throw gitSyncError(
        409,
        GitSyncErrorCode.CONFLICT_RESOLVED,
        'Conflict already resolved'
      )
    }
    const live = await tx.localeValue.findFirst({
      where: {
        locale: conflict.locale,
        i18nKey: { projectId: params.projectId, key: conflict.key },
      },
      select: { draftText: true, publishedText: true },
    })
    // Use platform and rename leave the platform text alone, so only the
    // actions that write over it need the card to still describe it.
    if (
      (params.action === 'theirs' || params.action === 'merged') &&
      !conflictStillHolds(conflict.oursText, live)
    ) {
      await tx.gitSyncConflict.update({
        where: { id: conflict.id },
        data: { status: GitSyncConflictStatus.OBSOLETE },
      })
      return null
    }
    let chosen: string
    switch (params.action) {
      case 'renamed':
        // Git keeps its text under this key, so only this side can step aside.
        // Note this writes no draft under `conflict.key` — doing so would
        // re-create the very key the rename just moved away from.
        chosen = await renameKeyOutOfSync(
          { projectId: params.projectId, key: conflict.key, newKey: params.newKey },
          tx
        )
        break
      case 'ours':
        // Use platform leaves the platform exactly as it is now — draft,
        // published and outdated state included. The card's `oursText` is only
        // what the platform held at preview time.
        chosen = live?.publishedText ?? live?.draftText ?? ''
        break
      case 'theirs':
      case 'merged':
        chosen =
          params.action === 'theirs' ? conflict.theirsText : (params.text ?? '')
        await upsertDraft(
          {
            projectId: params.projectId,
            key: conflict.key,
            locale: conflict.locale,
            text: chosen,
            commitSha,
            sourceLocale,
            // Taking Git's translation of an older source lands it outdated. A
            // merged text was edited with the warning in view, so it counts as
            // written against the current source.
            sourceFingerprint:
              params.action === 'theirs' && conflict.olderSourceText != null
                ? fpTranslation(conflict.olderSourceText)
                : undefined,
          },
          tx
        )
        break
      default: {
        const _exhaustive: never = params.action
        return _exhaustive
      }
    }
    // Last seen Git stays the remote side. Use platform must not move base
    // onto ours, or the next Pull classifies the same key as apply-theirs.
    //
    // Runs for `renamed` too, and deliberately under the *vacated* name: it is
    // what makes that name read as `keep-ours` and be filtered out, instead of
    // `apply-theirs`, which would pull the key straight back.
    await setBase(
      {
        projectId: params.projectId,
        key: conflict.key,
        locale: conflict.locale,
        text: conflict.theirsText,
        commitSha,
      },
      tx
    )
    await writeGitSyncLog(
      {
        projectId: params.projectId,
        action: GitSyncLogAction.CONFLICT_RESOLVE,
        status: GitSyncLogStatus.SUCCESS,
        commitSha,
        detail: {
          key: conflict.key,
          locale: conflict.locale,
          action: params.action,
        },
        userId: params.userId,
      },
      tx
    )
    return tx.gitSyncConflict.update({
      where: { id: conflict.id },
      data: { mergedText: chosen },
    })
  })
  if (!resolved) {
    throw gitSyncError(
      409,
      GitSyncErrorCode.CONFLICT_STALE,
      'The platform text changed since this conflict was found — run a new preview'
    )
  }
  return resolved
}
