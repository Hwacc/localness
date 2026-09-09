import { omit } from 'lodash-es'
import prisma from '#server/libs/prisma'
import { isI18nKeyDraft } from '#shared/utils'

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
    include: { locales: true },
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

export function shapeI18nKey(
  record: {
    id: number
    fingerprint: string
    origin: string
    createdAt?: Date
    updatedAt?: Date
    locales?: LocaleRow[]
  },
  version: I18nContentVersion = 'draft'
) {
  const content = localesToContent(record.locales, version)
  return {
    id: record.id,
    fingerprint: record.fingerprint,
    origin: record.origin,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
    vue: content,
    react: { ...content },
  }
}

export function shapeI18nKeyRow(row: {
  id: number
  key: string
  origin: string
  description: string | null
  updatedAt: Date
  locales: Array<{
    locale: string
    draftText: string | null
    publishedText: string | null
  }>
  _count?: { tags: number }
  tagCount?: number
}) {
  const locales = row.locales.map((locale) => ({
    locale: locale.locale,
    draftText: locale.draftText,
    publishedText: locale.publishedText,
  }))
  return {
    id: row.id,
    key: row.key,
    origin: row.origin,
    description: row.description,
    updatedAt: row.updatedAt,
    tagCount: row.tagCount ?? row._count?.tags ?? 0,
    dirty: isI18nKeyDraft(locales),
    locales,
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

export function shapeProject<T extends { team?: { members?: { user: unknown }[] } }>(
  project: T
) {
  const users = project.team?.members?.map((m) => m.user) ?? []
  return {
    ...project,
    users,
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

export async function resolveTagI18n(params: {
  pageID: number
  i18nKey?: string | null
  translationID?: number | null
  origin?: string
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

  if (params.translationID) {
    const current = await prisma.i18nKey.findUnique({
      where: { id: params.translationID },
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

    if (!clash.origin && current.origin) {
      await prisma.i18nKey.update({
        where: { id: clash.id },
        data: {
          origin: current.origin,
          fingerprint: clash.fingerprint || current.fingerprint,
        },
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
        origin: params.origin ?? '',
        fingerprint: params.fingerprint ?? '',
      },
      update: {},
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
  return tag ? shapeTag(tag) : null
}
