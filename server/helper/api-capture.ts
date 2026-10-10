import { createError } from 'h3'
import prisma from '#server/libs/prisma'
import { sourceLocaleOf } from '#server/helper/i18n'
import { isProjectSteward } from '#server/helper/project-owner'
import type { CaptureKeyHit, CaptureKeySearch, CaptureMatch, CapturePage, CaptureTag } from '#shared/types/Import'

/**
 * Capture reads for a design tool. Draft source text is visible here on
 * purpose. `bundle` and `locales` stay published-only so a consumer of shipped
 * copy never receives a draft.
 */

/** Layout whitespace is not wording, same rule the plugin used to apply locally. */
export function normalizeCaptureText(text: string): string {
  return text.replace(/\s+/g, ' ').trim()
}

export interface CaptureSourceRow {
  id: number
  key: string
  draftText: string | null
  publishedText: string | null
  releaseIds: number[]
}

/** Draft wins. A published sentence is still a match when no draft has replaced it. */
export function sourceWording(row: Pick<CaptureSourceRow, 'draftText' | 'publishedText'>): {
  text: string
  draft: boolean
} | null {
  const draft = row.draftText?.trim()
  if (draft) return { text: draft, draft: true }
  const published = row.publishedText?.trim()
  if (published) return { text: published, draft: false }
  return null
}

export function toCaptureHit(row: CaptureSourceRow): CaptureKeyHit {
  const wording = sourceWording(row)
  return {
    id: row.id,
    key: row.key,
    sourceText: wording?.text ?? '',
    draft: wording ? wording.draft : true,
    releaseIds: [...row.releaseIds].sort((a, b) => a - b),
  }
}

/**
 * Each submitted text keeps its place. Several keys sharing one wording all
 * come back — settling that is the person's job, not a release label's.
 */
export function matchCaptureTexts(rows: CaptureSourceRow[], texts: string[]): CaptureMatch {
  const byText = new Map<string, CaptureKeyHit[]>()
  for (const row of rows) {
    const hit = toCaptureHit(row)
    const normalized = normalizeCaptureText(hit.sourceText)
    if (!normalized) continue
    const bucket = byText.get(normalized)
    if (bucket) bucket.push(hit)
    else byText.set(normalized, [hit])
  }
  return {
    matches: texts.map((text) => ({
      text,
      keys: byText.get(normalizeCaptureText(text)) ?? [],
    })),
  }
}

const SEARCH_LIMIT = 20

export async function tokenManagesReleases(userId: number, projectId: number): Promise<boolean> {
  const row = await prisma.projectOwner.findUnique({
    where: { userId_projectId: { userId, projectId } },
    select: { userId: true },
  })
  return isProjectSteward({ userId, ownerUserIds: row ? [row.userId] : [] })
}

/** Defining a release is project configuration. Attaching one is not. */
export async function assertTokenManagesReleases(userId: number, projectId: number): Promise<void> {
  if (await tokenManagesReleases(userId, projectId)) return
  throw createError({
    statusCode: 403,
    statusMessage: 'Only a project owner can create a release',
  })
}

async function sourceRows(projectId: number): Promise<CaptureSourceRow[]> {
  const locale = await sourceLocaleOf(projectId)
  const rows = await prisma.i18nKey.findMany({
    where: { projectId },
    orderBy: { key: 'asc' },
    select: {
      id: true,
      key: true,
      releases: { select: { releaseId: true } },
      locales: {
        where: { locale },
        select: { draftText: true, publishedText: true },
      },
    },
  })
  return rows.map((row) => ({
    id: row.id,
    key: row.key,
    draftText: row.locales[0]?.draftText ?? null,
    publishedText: row.locales[0]?.publishedText ?? null,
    releaseIds: row.releases.map((release) => release.releaseId),
  }))
}

export async function matchCaptureLayers(projectId: number, texts: string[]): Promise<CaptureMatch> {
  return matchCaptureTexts(await sourceRows(projectId), texts)
}

export async function searchCaptureKeys(params: {
  projectId: number
  query: string
  offset?: number
  limit?: number
}): Promise<CaptureKeySearch> {
  const query = params.query.trim()
  const limit = Math.min(Math.max(params.limit ?? SEARCH_LIMIT, 1), 50)
  const offset = Math.max(params.offset ?? 0, 0)
  if (!query) return { keys: [], total: 0 }

  const locale = await sourceLocaleOf(params.projectId)
  const where = {
    projectId: params.projectId,
    OR: [
      { key: { contains: query } },
      {
        locales: {
          some: {
            locale,
            OR: [
              { draftText: { contains: query } },
              { publishedText: { contains: query } },
            ],
          },
        },
      },
    ],
  }
  const [total, rows] = await Promise.all([
    prisma.i18nKey.count({ where }),
    prisma.i18nKey.findMany({
      where,
      orderBy: { key: 'asc' },
      skip: offset,
      take: limit,
      select: {
        id: true,
        key: true,
        releases: { select: { releaseId: true } },
        locales: {
          where: { locale },
          select: { draftText: true, publishedText: true },
        },
      },
    }),
  ])
  const keys = rows.map((row) =>
    toCaptureHit({
      id: row.id,
      key: row.key,
      draftText: row.locales[0]?.draftText ?? null,
      publishedText: row.locales[0]?.publishedText ?? null,
      releaseIds: row.releases.map((release) => release.releaseId),
    })
  )
  return { keys, total }
}

export async function readCapturePage(projectId: number, pageId: number): Promise<CapturePage> {
  const locale = await sourceLocaleOf(projectId)
  const page = await prisma.page.findFirst({
    where: { id: pageId, projectID: projectId },
    select: {
      id: true,
      projectID: true,
      name: true,
      image: true,
      releases: { select: { releaseId: true } },
      tags: {
        orderBy: { id: 'asc' },
        select: {
          id: true,
          figmaNodeId: true,
          x: true,
          y: true,
          width: true,
          height: true,
          i18nKey: true,
          i18nKeyId: true,
          i18nKeyRecord: {
            select: {
              releases: { select: { releaseId: true } },
              locales: {
                where: { locale },
                select: { draftText: true, publishedText: true },
              },
            },
          },
        },
      },
    },
  })
  if (!page) {
    throw createError({ statusCode: 404, statusMessage: 'Page not found' })
  }

  const tags: CaptureTag[] = page.tags.map((tag) => {
    const localeRow = tag.i18nKeyRecord?.locales[0]
    return {
      id: tag.id,
      figmaNodeId: tag.figmaNodeId,
      x: tag.x,
      y: tag.y,
      width: tag.width,
      height: tag.height,
      i18nKey: tag.i18nKey,
      i18nKeyId: tag.i18nKeyId,
      draftText: localeRow?.draftText ?? null,
      publishedText: localeRow?.publishedText ?? null,
      releaseIds: (tag.i18nKeyRecord?.releases ?? [])
        .map((release) => release.releaseId)
        .sort((a, b) => a - b),
    }
  })

  return {
    pageId: page.id,
    // The where clause above already matched this project; `Page.projectID` is
    // nullable in the schema, so the argument is the same value without the cast.
    projectId,
    name: page.name,
    image: page.image,
    releaseIds: page.releases.map((release) => release.releaseId).sort((a, b) => a - b),
    tags,
  }
}
