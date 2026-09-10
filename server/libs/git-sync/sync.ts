import { createError } from 'h3'
import prisma from '#server/libs/prisma'
import {
  DRAFT_KEY_PREFIX,
  fpTranslation,
} from '#shared/utils'
import {
  GIT_SYNC_PREVIEW_TTL_MS,
  GitSyncPreviewKind,
  GitSyncPreviewStatus,
  GitSyncPushReason,
} from '#shared/constants'
import { decideThreeWay, type ThreeWayDecision } from './three-way'
import { classifyPush, isPushEligible, isPullProposed } from './filters'
import { localeToRemote } from './credentials'
import { withClonedRepo, commitAndPush, remoteHeadSha } from './git-remote'
import {
  isLiltProduct,
  listLiltProducts,
  listRemoteFiles,
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

async function upsertDraft(
  params: {
    projectId: number
    key: string
    locale: string
    text: string
    commitSha: string
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
      origin: params.locale === 'en' ? params.text : '',
      fingerprint:
        params.locale === 'en' ? fpTranslation(params.text) : '',
    },
    update:
      params.locale === 'en'
        ? {
            origin: params.text,
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
      publishedText: null,
    },
    update: { draftText: params.text },
  })
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
      // Default proposal: files git has not shown us before, or whose bytes
      // changed since we last read them. The user may add seen files back.
      const proposed = files.filter((f) => isPullProposed(f.reason))
      const candidates = await buildPullCandidates(
        projectId,
        repoDir,
        proposed
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
      out.push({
        key,
        locale,
        relPath: origin.get(`${locale}\0${key}`) ?? '',
        baseText: base ?? '',
        oursText: ours ?? '',
        theirsText: theirs,
        publishedText: loc?.publishedText ?? null,
        decision: decideThreeWay(base, ours, theirs),
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
  const commitSha = preview.commitSha
  let applied = 0
  let aligned = 0
  let kept = 0
  let conflicts = 0
  await prisma.$transaction(async (tx) => {
    for (const c of chosen) {
      switch (c.decision) {
        case 'apply-theirs':
          await upsertDraft(
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
          await upsertConflict(
            {
              projectId,
              key: c.key,
              locale: c.locale,
              baseText: c.baseText,
              oursText: c.oursText,
              theirsText: c.theirsText,
              publishedText: c.publishedText,
            },
            tx
          )
          conflicts += 1
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
  reason: GitSyncPushReason
  eligible: boolean
}

export type PushPreview = {
  previewId: number
  sourceLocale: string
  expiresAt: Date
  candidates: PushCandidate[]
  counts: Record<GitSyncPushReason, number>
}

/**
 * Step 1 of push. Pure database work — no clone. Returns every source key
 * with the reason it is or is not proposed, so an empty delta is explainable
 * instead of a bare 400.
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
  await requireBinding(projectId)
  const project = await prisma.project.findUnique({
    where: { id: projectId },
    include: { settings: true },
  })
  const sourceLocal = project?.settings?.localeFallback || 'en'
  const keys = await prisma.i18nKey.findMany({
    where: { projectId },
    include: { locales: true },
  })
  const bases = await prisma.gitSyncBase.findMany({
    where: { projectId, locale: sourceLocal },
  })
  const lastPushed = new Map(bases.map((row) => [row.key, row.baseText]))
  const candidates: PushCandidate[] = []
  for (const key of keys) {
    const loc = key.locales.find((l) => l.locale === sourceLocal)
    const text = loc?.publishedText?.trim() ?? ''
    const baseText = lastPushed.get(key.key) ?? ''
    const reason = classifyPush(key.key, text, lastPushed)
    candidates.push({
      key: key.key,
      baseText,
      text,
      reason,
      eligible: isPushEligible(reason),
    })
  }
  candidates.sort((a, b) => a.key.localeCompare(b.key))
  const counts: Record<GitSyncPushReason, number> = {
    [GitSyncPushReason.NEW_KEY]: 0,
    [GitSyncPushReason.CHANGED]: 0,
    [GitSyncPushReason.UNCHANGED]: 0,
    [GitSyncPushReason.NOT_PUBLISHED]: 0,
    [GitSyncPushReason.DRAFT_KEY]: 0,
  }
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
      commitSha: '',
      createdBy,
      expiresAt,
      candidates: { sourceLocale: sourceLocal, candidates } as object,
    },
  })
  return {
    previewId: preview.id,
    sourceLocale: sourceLocal,
    expiresAt,
    candidates,
    counts,
  }
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
  const rows = await prisma.i18nKey.findMany({
    where: { projectId, key: { in: [...selected] } },
    include: { locales: { where: { locale: sourceLocal } } },
  })
  const entries: Record<string, string> = {}
  const skipped: { key: string; reason: GitSyncPushReason }[] = []
  for (const row of rows) {
    const text = row.locales[0]?.publishedText?.trim() ?? ''
    if (row.key.startsWith(DRAFT_KEY_PREFIX)) {
      skipped.push({ key: row.key, reason: GitSyncPushReason.DRAFT_KEY })
      continue
    }
    if (!text) {
      skipped.push({ key: row.key, reason: GitSyncPushReason.NOT_PUBLISHED })
      continue
    }
    entries[row.key] = text
  }
  if (!Object.keys(entries).length) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Nothing selected to push',
    })
  }
  return withClonedRepo({
    remoteUrl,
    branch: binding.branch,
    credentialKind: binding.credentialKind,
    token: binding.token,
    sparsePath: binding.product,
    run: async (repoDir, commitSha) => {
      const filename = await writeSourceBatch({
        repoRoot: repoDir,
        product: binding.product,
        sourceRemoteLocale: sourceRemote,
        entries,
      })
      const pushed = await commitAndPush({
        repoDir,
        message: `localness: source batch ${filename} (by ${params.triggeredBy})`,
        authorName: 'Localness Git Sync',
      })
      const result = {
        filename,
        count: Object.keys(entries).length,
        pushed,
        skipped,
      }
      if (pushed) {
        await prisma.$transaction(async (tx) => {
          const seen = seenFileMap(binding.seenFiles)
          // Our own batch: recorded with an empty sha so a later rewrite of
          // this file by someone else still shows up as changed.
          seen.set(`${binding.product}/source/${filename}`, '')
          await tx.gitSyncBinding.update({
            where: { id: binding.id },
            data: {
              lastPushedAt: new Date(),
              seenFiles: [...seen].map(([path, sha]) => ({ path, sha })),
            },
          })
          for (const [key, text] of Object.entries(entries)) {
            await setBase(
              { projectId, key, locale: sourceLocal, text, commitSha },
              tx
            )
          }
          await tx.gitSyncPreview.update({
            where: { id: preview.id },
            data: {
              status: GitSyncPreviewStatus.APPLIED,
              commitSha,
              result: result as object,
            },
          })
        })
      }
      return result
    },
  })
}

export async function resolveConflict(params: {
  projectId: number
  conflictId: number
  action: 'ours' | 'theirs' | 'merged'
  text?: string
  commitSha?: string
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
  await upsertDraft({
    projectId: params.projectId,
    key: conflict.key,
    locale: conflict.locale,
    text: chosen,
    commitSha: params.commitSha ?? '',
  })
  return prisma.gitSyncConflict.update({
    where: { id: conflict.id },
    data: {
      status: params.action,
      mergedText: chosen,
    },
  })
}
