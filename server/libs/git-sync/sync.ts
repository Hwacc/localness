import { createError } from 'h3'
import prisma from '#server/libs/prisma'
import {
  DRAFT_KEY_PREFIX,
  fpTranslation,
} from '#shared/utils'
import {
  GIT_SYNC_PREVIEW_TTL_MS,
  GIT_SYNC_PUSH_CLONE_DEPTH,
  GitSyncLogAction,
  GitSyncLogStatus,
  GitSyncPreviewKind,
  GitSyncPreviewStatus,
  GitSyncPushReason,
} from '#shared/constants'
import { countSkipReasons, writeGitSyncLog } from './log'
import { sourceLocaleOf } from '#server/helper/i18n'
import type { ThreeWayDecision } from './three-way'
import {
  classifyPull,
  classifyPush,
  emptyPushCounts,
  isPushEligible,
} from './filters'
import { localeToRemote } from './credentials'
import {
  withClonedRepo,
  commitAndPush,
  remoteHeadSha,
  findCommitByTrailer,
} from './git-remote'
import {
  isLiltProduct,
  listLiltProducts,
  listRemoteFiles,
  readMergedSourceLocale,
  readSelectedLocaleMaps,
  seenFileMap,
  writeSourceBatch,
  type RemoteFileInfo,
} from './lilt-swbu'

export function publicGitSyncBinding(row: {
  id: number
  enabled: boolean
  adapter: string
  remoteUrl: string
  branch: string
  product: string
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
    credentialKind: row.credentialKind,
    tokenConfigured: Boolean(row.token),
    lastPulledAt: row.lastPulledAt,
    lastPushedAt: row.lastPushedAt,
  }
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
  await db.localeValue.upsert({
    where: {
      i18nKeyId_locale: { i18nKeyId: record.id, locale: params.locale },
    },
    create: {
      i18nKeyId: record.id,
      locale: params.locale,
      draftText: params.text,
      publishedText: params.text,
    },
    update: { draftText: params.text, publishedText: params.text },
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
      status: 'open',
      mergedText: null,
    },
  })
}

export async function discoverLiltProducts(params: {
  remoteUrl: string
  branch: string
  credentialKind: string
  token: string
}) {
  return withClonedRepo({
    remoteUrl: params.remoteUrl,
    branch: params.branch,
    credentialKind: params.credentialKind,
    token: params.token,
    run: async (repoDir) => listLiltProducts(repoDir),
  })
}

type ResolvedBinding = Awaited<
  ReturnType<typeof prisma.gitSyncBinding.findUnique>
> & object

/** Shared guard: sync is enabled, product is sane, remote is set. */
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
  if (!isLiltProduct(binding.product)) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Invalid product folder name',
    })
  }
  const remoteUrl = binding.remoteUrl.trim()
  if (!remoteUrl) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Remote URL is missing',
    })
  }
  return { binding: binding as ResolvedBinding, remoteUrl }
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
}

export type PullPreview = {
  previewId: number
  commitSha: string
  expiresAt: Date
  files: RemoteFileInfo[]
  candidates: PullCandidate[]
  counts: Record<ThreeWayDecision, number>
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
  const { binding, remoteUrl } = await requireBinding(projectId)
  const override = localeOverride(binding.localeMap)
  const seen = seenFileMap(binding.seenFiles)
  return withClonedRepo({
    remoteUrl,
    branch: binding.branch,
    credentialKind: binding.credentialKind,
    token: binding.token,
    sparsePath: binding.product,
    run: async (repoDir, commitSha) => {
      const files = await listRemoteFiles(
        repoDir,
        binding.product,
        override,
        seen
      )
      // Merge every batch so a seen file that still disagrees with the last
      // landing (Git ahead, platform unchanged) shows up as apply-theirs —
      // otherwise it is skipped on Push and invisible on Pull.
      const allCandidates = await buildPullCandidates(
        projectId,
        repoDir,
        files
      )
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
          candidates: { files, candidates } as object,
        },
      })
      for (const c of candidates) {
        if (c.decision !== 'conflict') continue
        await upsertConflict({
          projectId,
          key: c.key,
          locale: c.locale,
          baseText: c.baseText,
          oursText: c.oursText,
          theirsText: c.theirsText,
          publishedText: c.publishedText,
        })
      }
      return {
        previewId: preview.id,
        commitSha,
        expiresAt,
        files,
        candidates,
        counts,
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
  repoDir: string,
  files: RemoteFileInfo[]
): Promise<PullCandidate[]> {
  const { maps: remote, origin } = await readSelectedLocaleMaps(repoDir, files)
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
  for (const [locale, map] of remote) {
    for (const [key, theirs] of map) {
      if (key.startsWith(DRAFT_KEY_PREFIX)) continue
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
      out.push({
        key,
        locale,
        relPath: origin.get(`${locale}\0${key}`) ?? '',
        baseText: base ?? '',
        oursText: ours ?? '',
        theirsText: theirs,
        publishedText: loc?.publishedText ?? null,
        decision,
      })
    }
  }
  return out
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
  if (preview.status !== GitSyncPreviewStatus.PENDING) {
    throw createError({
      statusCode: 409,
      statusMessage: 'Preview already used — run a new preview',
    })
  }
  if (preview.expiresAt.getTime() < Date.now()) {
    await prisma.gitSyncPreview.update({
      where: { id: preview.id },
      data: { status: GitSyncPreviewStatus.CANCELLED },
    })
    throw createError({
      statusCode: 409,
      statusMessage: 'Preview expired — run a new preview',
    })
  }
  return preview
}

/**
 * Step 3 of pull. The stored snapshot is reused only if the remote head is
 * unchanged, so `selection` acts as a filter over an up-to-date candidate
 * set rather than as a stale data snapshot.
 */
export async function applyPull(params: {
  projectId: number
  previewId: number
  selectedFiles: string[]
  selectedKeys: string[]
  userId?: number | null
}) {
  const { projectId, previewId } = params
  const { binding, remoteUrl } = await requireBinding(projectId)
  const preview = await loadPendingPreview(
    projectId,
    previewId,
    GitSyncPreviewKind.PULL
  )
  const head = await remoteHeadSha({
    remoteUrl,
    branch: binding.branch,
    credentialKind: binding.credentialKind,
    token: binding.token,
  })
  if (head !== preview.commitSha) {
    await prisma.gitSyncPreview.update({
      where: { id: preview.id },
      data: { status: GitSyncPreviewStatus.CANCELLED },
    })
    throw createError({
      statusCode: 409,
      statusMessage: 'Remote changed since preview — run a new preview',
    })
  }
  const snapshot = preview.candidates as unknown as {
    files: RemoteFileInfo[]
    candidates: PullCandidate[]
  }
  const fileFilter = new Set(params.selectedFiles)
  const keyFilter = new Set(params.selectedKeys)
  const chosenFiles = snapshot.files.filter((f) => fileFilter.has(f.relPath))
  const chosen = snapshot.candidates.filter(
    (c) => keyFilter.has(`${c.key}\0${c.locale}`)
  )
  if (!chosen.length) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Nothing selected to pull',
    })
  }
  let openConflicts = 0
  for (const c of snapshot.candidates) {
    if (c.decision !== 'conflict') continue
    const existing = await prisma.gitSyncConflict.findFirst({
      where: { projectId, key: c.key, locale: c.locale },
    })
    if (!existing || existing.status === 'open') openConflicts += 1
  }
  if (openConflicts > 0) {
    throw createError({
      statusCode: 409,
      statusMessage: `Resolve ${openConflicts} conflict(s) before applying pull`,
    })
  }
  const commitSha = preview.commitSha
  // Resolved before the transaction on purpose: Prisma's SQLite client holds the
  // one connection open inside it, so a query out there could only wait.
  const sourceLocale = await sourceLocaleOf(projectId)
  let applied = 0
  let aligned = 0
  let kept = 0
  const conflicts = 0
  await prisma.$transaction(async (tx) => {
    for (const c of chosen) {
      switch (c.decision) {
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
            },
            tx
          )
          await setBase(
            { projectId, key: c.key, locale: c.locale, text: c.theirsText, commitSha },
            tx
          )
          applied += 1
          break
        case 'keep-ours':
          kept += 1
          break
        case 'align':
          await setBase(
            { projectId, key: c.key, locale: c.locale, text: c.theirsText, commitSha },
            tx
          )
          aligned += 1
          break
        case 'conflict':
          // Cards are written at preview and must be resolved before Apply.
          break
        default: {
          const _exhaustive: never = c.decision
          return _exhaustive
        }
      }
    }
    // Only files the user actually accepted are marked seen, so skipping a
    // file now leaves it a candidate next time instead of hiding it forever.
    const seen = seenFileMap(binding.seenFiles)
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
        result: { applied, aligned, kept, conflicts } as object,
      },
    })
    await writeGitSyncLog(
      {
        projectId,
        action: GitSyncLogAction.PULL_APPLY,
        status: kept
          ? GitSyncLogStatus.PARTIAL
          : GitSyncLogStatus.SUCCESS,
        previewId: preview.id,
        commitSha,
        detail: { applied, aligned, kept, files: chosenFiles.length },
        userId: params.userId,
      },
      tx
    )
  })
  return {
    applied,
    aligned,
    kept,
    conflicts,
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
  const openCount = await prisma.gitSyncConflict.count({
    where: { projectId, status: 'open' },
  })
  if (openCount > 0) {
    throw createError({
      statusCode: 409,
      statusMessage: `Resolve ${openCount} open conflict(s) before push`,
    })
  }
  const { binding, remoteUrl } = await requireBinding(projectId)
  const project = await prisma.project.findUnique({
    where: { id: projectId },
    include: { settings: true },
  })
  const sourceLocal = project?.settings?.localeFallback || 'en'
  // Keys kept out of Git sync never enter the candidate loop. Filtering the
  // query rather than adding a push reason keeps the reason counts, the
  // eligibility rules and the UI's reason filters untouched.
  const keys = await prisma.i18nKey.findMany({
    where: { projectId, gitSyncEnabled: true },
    include: { locales: true },
  })
  const bases = await prisma.gitSyncBase.findMany({
    where: { projectId, locale: sourceLocal },
  })
  const lastPushed = new Map(bases.map((row) => [row.key, row.baseText]))
  const override = localeOverride(binding.localeMap)
  return withClonedRepo({
    remoteUrl,
    branch: binding.branch,
    credentialKind: binding.credentialKind,
    token: binding.token,
    sparsePath: binding.product,
    run: async (repoDir, commitSha) => {
      const remote = await readMergedSourceLocale(
        repoDir,
        binding.product,
        sourceLocal,
        override
      )
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
      candidates.sort((a, b) => a.key.localeCompare(b.key))
      const counts = emptyPushCounts()
      for (const c of candidates) counts[c.reason] += 1
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
          candidates: { sourceLocale: sourceLocal, candidates } as object,
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
export async function applyPush(params: {
  projectId: number
  previewId: number
  selectedKeys: string[]
  triggeredBy: string
  userId?: number | null
}) {
  const { projectId, previewId } = params
  const openCount = await prisma.gitSyncConflict.count({
    where: { projectId, status: 'open' },
  })
  if (openCount > 0) {
    throw createError({
      statusCode: 409,
      statusMessage: `Resolve ${openCount} open conflict(s) before push`,
    })
  }
  const { binding, remoteUrl } = await requireBinding(projectId)
  const preview = await loadPendingPreview(
    projectId,
    previewId,
    GitSyncPreviewKind.PUSH
  )
  const snapshot = preview.candidates as unknown as {
    sourceLocale: string
    candidates: PushCandidate[]
  }
  const sourceLocal = snapshot.sourceLocale
  const override = localeOverride(binding.localeMap)
  const sourceRemote = localeToRemote(sourceLocal, override)
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
      const orphan = await findCommitByTrailer(repoDir, trailer)
      if (orphan) {
        const overlay: Record<string, string> = {}
        for (const row of rows) {
          if (!selected.has(row.key)) continue
          const text = row.locales[0]?.publishedText?.trim() ?? ''
          if (text && !row.key.startsWith(DRAFT_KEY_PREFIX)) {
            overlay[row.key] = text
          }
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
          result,
          userId: params.userId,
        })
        return result
      }
      const remote = await readMergedSourceLocale(
        repoDir,
        binding.product,
        sourceLocal,
        override
      )
      const overlay: Record<string, string> = {}
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
            if (picked) overlay[row.key] = text
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
            if (picked) overlay[row.key] = text
            break
          case GitSyncPushReason.UNCHANGED:
          case GitSyncPushReason.NOT_PUBLISHED:
          case GitSyncPushReason.DRAFT_KEY:
            if (picked) skipped.push({ key: row.key, reason })
            break
          default: {
            const _exhaustive: never = reason
            return _exhaustive
          }
        }
      }
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
        throw createError({
          statusCode: conflictRows.length ? 409 : 400,
          statusMessage: conflictRows.length
            ? 'Remote source diverged — resolve conflicts on /git'
            : 'Nothing selected to push',
        })
      }
      const filename = await writeSourceBatch({
        repoRoot: repoDir,
        product: binding.product,
        sourceRemoteLocale: sourceRemote,
        entries: overlay,
      })
      const pushed = await commitAndPush({
        repoDir,
        message: `localness: source batch ${filename} (by ${params.triggeredBy})\n\n${trailer}`,
        authorName: 'Localness Git Sync',
      })
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
          batchPath: `${binding.product}/source/${filename}`,
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
 * Bookkeeping for a batch that is already on the remote: mark the files seen,
 * move the three-way base up to what we published, and close out the preview.
 */
async function recordPushLanding(params: {
  binding: { id: number; seenFiles: unknown }
  projectId: number
  previewId: number
  sourceLocal: string
  overlay: Record<string, string>
  commitSha: string
  batchPath: string | null
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
    const data: { lastPushedAt: Date; seenFiles?: object } = {
      lastPushedAt: new Date(),
    }
    if (params.batchPath) {
      const seen = seenFileMap(params.binding.seenFiles)
      // Our own batch: recorded with an empty sha so a later rewrite of this
      // file by someone else still shows up as changed.
      seen.set(params.batchPath, '')
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
async function renameKeyOutOfSync(params: {
  projectId: number
  key: string
  newKey?: string
}): Promise<string> {
  const newKey = params.newKey?.trim()
  if (!newKey) {
    throw createError({
      statusCode: 400,
      statusMessage: 'renamed action requires newKey',
    })
  }
  const row = await prisma.i18nKey.findFirst({
    where: { projectId: params.projectId, key: params.key },
    select: { id: true },
  })
  // The platform side can already be gone — a key deleted after the conflict
  // was raised. Nothing to move then, but the conflict still has to close, and
  // the caller's `setBase` is what keeps the remote name from coming back.
  if (!row) return newKey

  const clash = await prisma.i18nKey.findFirst({
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

  await prisma.$transaction(async (tx) => {
    await tx.i18nKey.update({
      where: { id: row.id },
      data: { key: newKey, gitSyncEnabled: false },
    })
    await tx.tag.updateMany({
      where: { i18nKeyId: row.id },
      data: { i18nKey: newKey },
    })
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
  if (conflict.status !== 'open') {
    throw createError({
      statusCode: 409,
      statusMessage: 'Conflict already resolved',
    })
  }
  let chosen: string
  if (params.action === 'renamed') {
    // The remote is append-only, so only this side can step aside. Note this
    // writes no draft under `conflict.key` — doing so would re-create the very
    // key the rename just moved away from.
    chosen = await renameKeyOutOfSync({
      projectId: params.projectId,
      key: conflict.key,
      newKey: params.newKey,
    })
  } else {
    switch (params.action) {
      case 'ours':
        chosen = conflict.oursText
        break
      case 'theirs':
        chosen = conflict.theirsText
        break
      case 'merged':
        if (params.text == null) {
          throw createError({
            statusCode: 400,
            statusMessage: 'merged action requires text',
          })
        }
        chosen = params.text
        break
      default: {
        const _exhaustive: never = params.action
        return _exhaustive
      }
    }
    const sourceLocale = await sourceLocaleOf(params.projectId)
    await upsertDraft({
      projectId: params.projectId,
      key: conflict.key,
      locale: conflict.locale,
      text: chosen,
      commitSha: params.commitSha ?? '',
      sourceLocale,
    })
  }
  // Last seen Git stays the remote side. Use platform must not move base
  // onto ours, or the next Pull classifies the same key as apply-theirs.
  //
  // Runs for `renamed` too, and deliberately under the *vacated* name: it is
  // what makes that name read as `keep-ours` and be filtered out, instead of
  // `apply-theirs`, which would pull the key straight back.
  await setBase({
    projectId: params.projectId,
    key: conflict.key,
    locale: conflict.locale,
    text: conflict.theirsText,
    commitSha: params.commitSha ?? '',
  })
  await writeGitSyncLog({
    projectId: params.projectId,
    action: GitSyncLogAction.CONFLICT_RESOLVE,
    status: GitSyncLogStatus.SUCCESS,
    commitSha: params.commitSha ?? '',
    detail: {
      key: conflict.key,
      locale: conflict.locale,
      action: params.action,
    },
    userId: params.userId,
  })
  return prisma.gitSyncConflict.update({
    where: { id: conflict.id },
    data: {
      status: params.action,
      mergedText: chosen,
    },
  })
}
