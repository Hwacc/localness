import { createError } from 'h3'
import prisma from '#server/libs/prisma'
import {
  DRAFT_KEY_PREFIX,
  fpTranslation,
} from '#shared/utils'
import { decideThreeWay } from './three-way'
import { localeToRemote } from './credentials'
import { withClonedRepo, commitAndPush } from './git-remote'
import {
  isLiltProduct,
  listLiltProducts,
  parseSeenFiles,
  readRemoteLocaleMaps,
  writeSourceBatch,
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

async function upsertDraft(params: {
  projectId: number
  key: string
  locale: string
  text: string
  commitSha: string
}) {
  const record = await prisma.i18nKey.upsert({
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
  await prisma.localeValue.upsert({
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
  await prisma.gitSyncBase.upsert({
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

async function setBase(params: {
  projectId: number
  key: string
  locale: string
  text: string
  commitSha: string
}) {
  await prisma.gitSyncBase.upsert({
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

async function upsertConflict(params: {
  projectId: number
  key: string
  locale: string
  baseText: string
  oursText: string
  theirsText: string
  publishedText: string | null
}) {
  await prisma.gitSyncConflict.upsert({
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

export async function pullProject(projectId: number) {
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
  const override = localeOverride(binding.localeMap)
  const skipRelPaths = new Set(parseSeenFiles(binding.seenFiles))
  return withClonedRepo({
    remoteUrl,
    branch: binding.branch,
    credentialKind: binding.credentialKind,
    token: binding.token,
    sparsePath: binding.product,
    run: async (repoDir, commitSha) => {
      const { maps: remote, allRelPaths, newRelPaths } =
        await readRemoteLocaleMaps(
          repoDir,
          binding.product,
          override,
          skipRelPaths
        )
      const keys = await prisma.i18nKey.findMany({
        where: { projectId },
        include: { locales: true },
      })
      const keyByName = new Map(keys.map((k) => [k.key, k]))
      const bases = await prisma.gitSyncBase.findMany({
        where: { projectId },
      })
      const baseMap = new Map(
        bases.map((b) => [`${b.key}\0${b.locale}`, b.baseText])
      )
      let applied = 0
      let aligned = 0
      let kept = 0
      let conflicts = 0
      for (const [locale, map] of remote) {
        for (const [key, theirs] of map) {
          if (key.startsWith(DRAFT_KEY_PREFIX)) continue
          const row = keyByName.get(key)
          const loc = row?.locales.find((l) => l.locale === locale)
          const ours = loc?.draftText ?? null
          const base = baseMap.get(`${key}\0${locale}`) ?? null
          const decision = decideThreeWay(base, ours, theirs)
          switch (decision) {
            case 'apply-theirs':
              await upsertDraft({
                projectId,
                key,
                locale,
                text: theirs,
                commitSha,
              })
              applied += 1
              break
            case 'keep-ours':
              kept += 1
              break
            case 'align':
              await setBase({
                projectId,
                key,
                locale,
                text: theirs,
                commitSha,
              })
              aligned += 1
              break
            case 'conflict':
              await upsertConflict({
                projectId,
                key,
                locale,
                baseText: base ?? '',
                oursText: ours ?? '',
                theirsText: theirs,
                publishedText: loc?.publishedText ?? null,
              })
              conflicts += 1
              break
            default: {
              const _exhaustive: never = decision
              return _exhaustive
            }
          }
        }
      }
      await prisma.gitSyncBinding.update({
        where: { id: binding.id },
        data: {
          lastPulledAt: new Date(),
          seenFiles: allRelPaths,
        },
      })
      return {
        applied,
        aligned,
        kept,
        conflicts,
        newFiles: newRelPaths.length,
      }
    },
  })
}

export async function pushProject(
  projectId: number,
  triggeredBy: string
) {
  const openCount = await prisma.gitSyncConflict.count({
    where: { projectId, status: 'open' },
  })
  if (openCount > 0) {
    throw createError({
      statusCode: 409,
      statusMessage: `Resolve ${openCount} open conflict(s) before push`,
    })
  }
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
  const project = await prisma.project.findUnique({
    where: { id: projectId },
    include: { settings: true },
  })
  const sourceLocal = project?.settings?.localeFallback || 'en'
  const override = localeOverride(binding.localeMap)
  const sourceRemote = localeToRemote(sourceLocal, override)
  const keys = await prisma.i18nKey.findMany({
    where: { projectId },
    include: { locales: true },
  })
  const bases = await prisma.gitSyncBase.findMany({
    where: { projectId, locale: sourceLocal },
  })
  const lastPushed = new Map(bases.map((row) => [row.key, row.baseText]))
  const entries: Record<string, string> = {}
  for (const key of keys) {
    if (key.key.startsWith(DRAFT_KEY_PREFIX)) continue
    const loc = key.locales.find((l) => l.locale === sourceLocal)
    const text = loc?.publishedText?.trim()
    if (!text) continue
    if (lastPushed.get(key.key) === text) continue
    entries[key.key] = text
  }
  if (!Object.keys(entries).length) {
    throw createError({
      statusCode: 400,
      statusMessage: 'No new published source strings to push',
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
        message: `localness: source batch ${filename} (by ${triggeredBy})`,
        authorName: 'Localness Git Sync',
      })
      if (pushed) {
        const seen = new Set(parseSeenFiles(binding.seenFiles))
        seen.add(`${binding.product}/source/${filename}`)
        await prisma.gitSyncBinding.update({
          where: { id: binding.id },
          data: {
            lastPushedAt: new Date(),
            seenFiles: [...seen],
          },
        })
        for (const [key, text] of Object.entries(entries)) {
          await setBase({
            projectId,
            key,
            locale: sourceLocal,
            text,
            commitSha,
          })
        }
      }
      return { filename, count: Object.keys(entries).length, pushed }
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
