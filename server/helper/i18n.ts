import { omit } from 'lodash-es'
import prisma from '#server/libs/prisma'

type LocaleRow = {
  locale: string
  draftText: string | null
}

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

export function localesToContent(locales: LocaleRow[] | undefined) {
  const content: Record<string, string | undefined> = {}
  if (!locales) return content
  for (const locale of locales) {
    content[locale.locale] = locale.draftText ?? undefined
  }
  return content
}

export function shapeI18nKey(record: {
  id: number
  fingerprint: string
  origin: string
  createdAt?: Date
  updatedAt?: Date
  locales?: LocaleRow[]
}) {
  const content = localesToContent(record.locales)
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

export function shapeTag<T extends { i18nKeyRecord?: any; i18nKeyId?: number | null }>(
  tag: T
) {
  const rec = tag.i18nKeyRecord
  return {
    ...omit(tag, ['i18nKeyRecord']),
    translationID: rec?.id ?? tag.i18nKeyId ?? undefined,
    translation: rec ? shapeI18nKey(rec) : undefined,
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

  const keyText = params.i18nKey?.trim()
  if (keyText) {
    const record = await prisma.i18nKey.upsert({
      where: {
        projectId_key: { projectId: page.projectID, key: keyText },
      },
      create: {
        projectId: page.projectID,
        key: keyText,
        origin: params.origin ?? '',
        fingerprint: params.fingerprint ?? '',
      },
      update: {},
    })
    return { i18nKeyId: record.id, i18nKey: keyText, projectId: page.projectID }
  }

  if (params.translationID) {
    const record = await prisma.i18nKey.findUnique({
      where: { id: params.translationID },
    })
    if (!record || record.projectId !== page.projectID) {
      throw createError({
        statusCode: 400,
        statusMessage: 'Invalid translation',
      })
    }
    return {
      i18nKeyId: record.id,
      i18nKey: record.key,
      projectId: page.projectID,
    }
  }

  return { i18nKeyId: null, i18nKey: null, projectId: page.projectID }
}

export async function loadShapedTag(id: number) {
  const tag = await prisma.tag.findUnique({
    where: { id },
    include: tagI18nInclude,
  })
  return tag ? shapeTag(tag) : null
}
