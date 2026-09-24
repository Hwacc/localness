import { omit } from 'lodash-es'
import prisma from '#server/libs/prisma'
import { isI18nKeyDraft } from '#shared/utils'
import { DEFAULT_LOCALE_FALLBACK } from '#shared/constants'
import { isProjectSteward } from '#server/helper/project-owner'

type LocaleRow = {
  locale: string
  draftText: string | null
  publishedText?: string | null
}

export type I18nContentVersion = 'draft' | 'published'

export const TAG_SETTINGS_OMIT = {
  id: true,
  tagID: true,
  createdAt: true,
  updatedAt: true,
} as const

export const PROJECT_SETTINGS_OMIT = {
  id: true,
  projectID: true,
  createdAt: true,
  updatedAt: true,
} as const

export const tagI18nInclude = {
  i18nKeyRecord: {
    include: {
      locales: true,
      // The editor edits the bound key's release labels, so it has to receive them.
      releases: { select: { releaseId: true } },
    },
  },
  settings: {
    omit: TAG_SETTINGS_OMIT,
  },
} as const

export const projectDetailInclude = {
  pages: {
    select: {
      id: true,
      name: true,
      image: true,
      createdAt: true,
      updatedAt: true,
      settings: {
        omit: {
          id: true,
          pageID: true,
          createdAt: true,
          updatedAt: true,
        },
      },
      // Just ids: the client filters pages by label locally; the list below has names.
      releases: {
        select: { releaseId: true },
      },
    },
    orderBy: {
      updatedAt: 'desc' as const,
    },
  },
  team: {
    include: {
      members: {
        include: {
          user: {
            omit: {
              password: true,
              createdAt: true,
              updatedAt: true,
            },
          },
        },
      },
    },
  },
  settings: {
    omit: PROJECT_SETTINGS_OMIT,
  },
  owners: {
    include: {
      user: {
        select: {
          id: true,
          username: true,
          nickname: true,
        },
      },
    },
  },
  // Release labels for the project, in display order.
  releases: {
    select: { id: true, name: true, sort: true },
    orderBy: [{ sort: 'asc' as const }, { id: 'asc' as const }],
  },
}

export function localesToContent(
  locales: LocaleRow[] | undefined,
  version: I18nContentVersion = 'draft'
) {
  const content: Record<string, string | undefined> = {}
  if (!locales) return content
  for (const locale of locales) {
    const text =
      version === 'published' ? locale.publishedText : locale.draftText
    if (version === 'published') {
      if (text) content[locale.locale] = text
    } else {
      content[locale.locale] = text ?? undefined
    }
  }
  return content
}

/**
 * A key's original text lives in the project's source language, so it is read
 * from that locale's draft instead of from a column of its own.
 */
export function sourceTextOf(
  locales: Array<{ locale: string; draftText?: string | null }> | undefined,
  sourceLocale: string
) {
  return locales?.find((row) => row.locale === sourceLocale)?.draftText ?? ''
}

/**
 * A key's original text travels in `vue`/`react` like every other locale — it is
 * the project's source language's entry, nothing beside it.
 */
export function shapeI18nKey(
  record: {
    id: number
    fingerprint: string
    createdAt?: Date
    updatedAt?: Date
    locales?: LocaleRow[]
    releases?: Array<{ releaseId: number }>
  },
  version: I18nContentVersion = 'draft'
) {
  const content = localesToContent(record.locales, version)
  return {
    id: record.id,
    fingerprint: record.fingerprint,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
    vue: content,
    react: { ...content },
    /**
     * Published entries are read-only — an edit to one has to go through
     * "revert to draft" first — so every surface that edits a key needs to know
     * which state it is in. Same meaning as the row's `dirty`: true is a draft.
     */
    dirty: isI18nKeyDraft(record.locales ?? []),
    /** Labels as plain ids, for the same reason pages carry them that way. */
    releaseIds: (record.releases ?? []).map((release) => release.releaseId),
  }
}

export function shapeI18nKeyRow(
  row: {
    id: number
    key: string
    description: string | null
    updatedAt: Date
    gitSyncEnabled?: boolean
    locales: Array<{
      locale: string
      draftText: string | null
      publishedText: string | null
    }>
    _count?: { tags: number }
    tagCount?: number
    releases?: Array<{ releaseId: number }>
  }
) {
  const locales = row.locales.map((locale) => ({
    locale: locale.locale,
    draftText: locale.draftText,
    publishedText: locale.publishedText,
  }))
  return {
    id: row.id,
    key: row.key,
    description: row.description,
    updatedAt: row.updatedAt,
    tagCount: row.tagCount ?? row._count?.tags ?? 0,
    dirty: isI18nKeyDraft(locales),
    locales,
    /** Labels as plain ids, for the same reason pages carry them that way. */
    releaseIds: (row.releases ?? []).map((release) => release.releaseId),
    /** Older callers build the row by hand; absent means the default, true. */
    gitSyncEnabled: row.gitSyncEnabled ?? true,
  }
}

export function assertI18nKeyWritable(
  locales: Array<{ draftText: string | null; publishedText: string | null }>
) {
  if (!isI18nKeyDraft(locales)) {
    throw createError({
      statusCode: 409,
      statusMessage: 'Published translations are read-only',
    })
  }
}

export function shapeTag<
  T extends { i18nKeyRecord?: any; i18nKeyId?: number | null },
>(tag: T, version: I18nContentVersion = 'draft') {
  const rec = tag.i18nKeyRecord
  return {
    ...omit(tag, ['i18nKeyRecord']),
    translationID: rec?.id ?? tag.i18nKeyId ?? undefined,
    translation: rec ? shapeI18nKey(rec, version) : undefined,
  }
}

export function shapeProject<
  T extends {
    team?: { members?: { userId?: number; role?: string; user: unknown }[] }
    owners?: {
      userId: number
      user?: { username?: string | null; nickname?: string | null }
    }[]
    /*
     * `unknown[]` rather than the page shape: callers that include pages without
     * their release joins are legitimate, and the narrowing happens below.
     */
    pages?: unknown[]
  },
>(project: T, viewerUserId?: number) {
  const users = project.team?.members?.map((m) => m.user) ?? []
  const ownerUserIds = (project.owners ?? []).map((o) => o.userId)
  const owners = (project.owners ?? []).map((o) => ({
    userId: o.userId,
    username: o.user?.username,
    nickname: o.user?.nickname,
  }))
  /*
   * Pages carry their release labels as plain ids — the editor sider filters them
   * locally, so it should not have to walk join rows on every render. The join
   * rows themselves are dropped rather than shipped alongside the ids.
   */
  const pages = project.pages?.map((page) => {
    const { releases, ...rest } = page as {
      releases?: { releaseId: number }[]
    }
    return {
      ...rest,
      releaseIds: (releases ?? []).map((row) => row.releaseId),
    }
  })
  return {
    ...project,
    ...(pages ? { pages } : {}),
    users,
    owners,
    isSteward:
      viewerUserId != null
        ? isProjectSteward({
            userId: viewerUserId,
            ownerUserIds,
          })
        : false,
  }
}

export async function upsertLocaleDrafts(
  i18nKeyId: number,
  content: Record<string, string | null | undefined>
) {
  const entries = Object.entries(content).filter(
    ([locale, text]) => locale && text !== undefined
  )
  for (const [locale, text] of entries) {
    const draftText = text ?? null
    await prisma.localeValue.upsert({
      where: {
        i18nKeyId_locale: { i18nKeyId, locale },
      },
      create: {
        i18nKeyId,
        locale,
        draftText,
        publishedText: null,
      },
      update: {
        draftText,
      },
    })
  }
}

export async function deleteUnusedDraftI18nKey(id: number) {
  const record = await prisma.i18nKey.findUnique({
    where: { id },
    select: { key: true, _count: { select: { tags: true } } },
  })
  if (!record || !record.key.startsWith('__draft_') || record._count.tags > 0) {
    return
  }
  await prisma.translationLog.updateMany({
    where: { i18nKeyId: id },
    data: { i18nKeyId: null },
  })
  await prisma.i18nKey.delete({ where: { id } })
}

/**
 * A project's source language: the locale a key's original text lives in. It is
 * also what Git pushes as `source/`, which locale leads the export's columns, and
 * what the delivery API reports as `localeFallback`.
 */
export async function sourceLocaleOf(
  projectId: number | null | undefined
): Promise<string> {
  if (!projectId) return DEFAULT_LOCALE_FALLBACK
  const settings = await prisma.projectSettings.findUnique({
    where: { projectID: projectId },
    select: { localeFallback: true },
  })
  return settings?.localeFallback || DEFAULT_LOCALE_FALLBACK
}

/** The source language has to be a language the project actually publishes. */
export function assertSourceLocale(locale: string, locales: string[]) {
  if (!locales.includes(locale)) {
    throw createError({
      statusCode: 400,
      statusMessage: `Source language must be one of the project's locales: ${locale}`,
    })
  }
}

/**
 * The source language's row *is* the key's original text, so writing one writes
 * that row. Draft side only: `publishedText` stays whatever a person published,
 * which is the copy Git pushes and the export carries.
 *
 * An empty text writes nothing — that would only leave an empty row behind.
 */
export async function writeSourceText(
  params: {
    projectId: number
    i18nKeyId: number
    text: string
    sourceLocale?: string
  },
  db: Pick<typeof prisma, 'localeValue'> = prisma
) {
  if (!params.text) return
  const locale =
    params.sourceLocale ?? (await sourceLocaleOf(params.projectId))
  await db.localeValue.upsert({
    where: { i18nKeyId_locale: { i18nKeyId: params.i18nKeyId, locale } },
    create: {
      i18nKeyId: params.i18nKeyId,
      locale,
      draftText: params.text,
      publishedText: null,
    },
    update: { draftText: params.text },
  })
}

export async function resolveTagI18n(params: {
  pageID: number
  i18nKey?: string | null
  translationID?: number | null
  sourceText?: string
  fingerprint?: string
}) {
  const page = await prisma.page.findUnique({
    where: { id: params.pageID },
    select: { projectID: true },
  })
  if (!page?.projectID) {
    throw createError({
      statusCode: 404,
      statusMessage: 'Page not found',
    })
  }

  const projectId = page.projectID
  const keyText = params.i18nKey?.trim() || null
  const sourceLocale = await sourceLocaleOf(projectId)

  if (params.translationID) {
    const current = await prisma.i18nKey.findUnique({
      where: { id: params.translationID },
      include: { locales: true },
    })
    if (!current || current.projectId !== projectId) {
      throw createError({
        statusCode: 400,
        statusMessage: 'Invalid translation',
      })
    }

    if (!keyText || keyText === current.key) {
      return { i18nKeyId: current.id, i18nKey: current.key, projectId }
    }

    const clash = await prisma.i18nKey.findUnique({
      where: { projectId_key: { projectId, key: keyText } },
      include: { locales: true },
    })

    if (!clash) {
      await prisma.i18nKey.update({
        where: { id: current.id },
        data: { key: keyText },
      })
      await prisma.tag.updateMany({
        where: { i18nKeyId: current.id },
        data: { i18nKey: keyText },
      })
      return { i18nKeyId: current.id, i18nKey: keyText, projectId }
    }

    // An empty original text adopts the other entry's, and the source language's
    // row is the only place it lives.
    const clashText = sourceTextOf(clash.locales, sourceLocale)
    const currentText = sourceTextOf(current.locales, sourceLocale)
    if (!clashText && currentText) {
      await prisma.i18nKey.update({
        where: { id: clash.id },
        data: {
          fingerprint: clash.fingerprint || current.fingerprint,
        },
      })
      await writeSourceText({
        projectId,
        i18nKeyId: clash.id,
        text: currentText,
        sourceLocale,
      })
    }
    return { i18nKeyId: clash.id, i18nKey: clash.key, projectId }
  }

  if (keyText) {
    const record = await prisma.i18nKey.upsert({
      where: {
        projectId_key: { projectId, key: keyText },
      },
      create: {
        projectId,
        key: keyText,
        fingerprint: params.fingerprint ?? '',
      },
      update: {},
    })
    await writeSourceText({
      projectId,
      i18nKeyId: record.id,
      text: params.sourceText ?? '',
      sourceLocale,
    })
    return { i18nKeyId: record.id, i18nKey: keyText, projectId }
  }

  return { i18nKeyId: null, i18nKey: null, projectId }
}

export async function loadShapedTag(id: number) {
  const tag = await prisma.tag.findUnique({
    where: { id },
    include: tagI18nInclude,
  })
  if (!tag) return null
  return shapeTag(tag)
}
