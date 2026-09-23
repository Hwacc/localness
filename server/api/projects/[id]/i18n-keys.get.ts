import prisma from '#server/libs/prisma'
import { numericID } from '#server/helper/id'
import { requireTeamMember } from '#server/helper/access'
import { shapeI18nKeyRow } from '#server/helper/i18n'
import { parseReleaseFilter, releaseWhereFragment } from '#server/helper/release'
import { I18nKeyStatusFilter } from '#shared/constants'
import { DRAFT_KEY_PREFIX } from '#shared/utils'

/**
 * Mirrors `isI18nKeyDraft` in SQL. A key is draft when it has no locale rows,
 * when nothing is published yet, or when any locale's draft differs from what
 * is published. The comparison spans two columns, so Prisma's `where` cannot
 * express it and filtering client-side would break pagination.
 */
const DRAFT_PREDICATE = `
  NOT EXISTS (
    SELECT 1 FROM "LocaleValue" lv
    WHERE lv."i18n_key_id" = k."id"
      AND COALESCE(lv."published_text", '') != ''
  )
  OR EXISTS (
    SELECT 1 FROM "LocaleValue" lv
    WHERE lv."i18n_key_id" = k."id"
      AND COALESCE(lv."draft_text", '') != COALESCE(lv."published_text", '')
  )
`

/** ISO instant from the client, or null. Bad input is ignored, not an error. */
function isoBound(raw: unknown): Date | null {
  if (typeof raw !== 'string' || !raw.trim()) return null
  const date = new Date(raw)
  return Number.isNaN(date.getTime()) ? null : date
}

/** Comma-separated numeric ids from the query, empty when absent. */
function idList(raw: unknown): number[] {
  const parts =
    typeof raw === 'string'
      ? raw.split(',')
      : Array.isArray(raw)
        ? raw.map(String)
        : []
  return parts
    .map((part) => Number(part.trim()))
    .filter((value) => Number.isInteger(value) && value > 0)
}

/**
 * @route GET /api/projects/:id/i18n-keys
 * @query q, status, from, to, pageIds, releaseId, unassigned, includeDraftKeys, idsOnly, page, limit
 * `from`/`to` are ISO instants bounding `updatedAt`; the client sends the
 * local day boundaries so the range means what the user picked on screen.
 * `pageIds` scopes to keys tagged on those pages, plus keys with no tag at all
 * (a plain translation entry is still exportable); `tagCount` is then counted
 * within that scope. `releaseId` / `unassigned=1` scope to release labels the
 * same way `idsOnly=1` returns every matching id without paging, so the export
 * picker can "select all matching" for one release.
 */
export default defineEventHandler(async (event) => {
  const id = getRouterParam(event, 'id')
  if (!id) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Missing project id',
    })
  }
  const nID = numericID(id)
  await requireTeamMember(event, nID)

  const query = getQuery(event)
  const q = typeof query.q === 'string' ? query.q.trim() : ''
  const status =
    query.status === I18nKeyStatusFilter.DRAFT ||
    query.status === I18nKeyStatusFilter.PUBLISHED
      ? query.status
      : I18nKeyStatusFilter.ALL
  const from = isoBound(query.from)
  const to = isoBound(query.to)
  const pageIds = idList(query.pageIds)
  const releaseFilter = parseReleaseFilter(query)
  const includeDraftKeys =
    query.includeDraftKeys === 'true' || query.includeDraftKeys === '1'
  const idsOnly = query.idsOnly === 'true' || query.idsOnly === '1'
  const page = Math.max(1, Number(query.page ?? 1) || 1)
  const limit = Math.min(100, Math.max(1, Number(query.limit ?? 20) || 20))
  const skip = (page - 1) * limit

  let statusIds: number[] | null = null
  if (status !== I18nKeyStatusFilter.ALL) {
    const rows = await prisma.$queryRawUnsafe<{ id: number }[]>(
      `SELECT k."id" FROM "I18nKey" k WHERE k."project_id" = ? AND (${
        status === I18nKeyStatusFilter.DRAFT
          ? DRAFT_PREDICATE
          : `NOT (${DRAFT_PREDICATE})`
      })`,
      nID
    )
    statusIds = rows.map((r) => Number(r.id))
    if (!statusIds.length) {
      return idsOnly ? { ids: [] } : new Pagination(page, limit, 0, [])
    }
  }

  const where = {
    projectId: nID,
    ...releaseWhereFragment(releaseFilter),
    ...(statusIds ? { id: { in: statusIds } } : {}),
    ...(includeDraftKeys ? {} : { NOT: { key: { startsWith: DRAFT_KEY_PREFIX } } }),
    ...(from || to
      ? {
          updatedAt: {
            ...(from ? { gte: from } : {}),
            ...(to ? { lte: to } : {}),
          },
        }
      : {}),
    // Two independent OR groups, so they have to be nested under AND.
    AND: [
      // Any locale's draft, not just the source language's: searching for a
      // sentence should not depend on which language the project calls original.
      ...(q
        ? [
            {
              OR: [
                { key: { contains: q } },
                { locales: { some: { draftText: { contains: q } } } },
              ],
            },
          ]
        : []),
      ...(pageIds.length
        ? [
            {
              OR: [
                { tags: { some: { pageID: { in: pageIds } } } },
                { tags: { none: {} } },
              ],
            },
          ]
        : []),
    ],
  }

  if (idsOnly) {
    const ids = await prisma.i18nKey.findMany({
      where,
      orderBy: { updatedAt: 'desc' },
      select: { id: true },
    })
    return { ids: ids.map((row) => row.id) }
  }

  const [total, rows] = await Promise.all([
    prisma.i18nKey.count({ where }),
    prisma.i18nKey.findMany({
      where,
      skip,
      take: limit,
      orderBy: { updatedAt: 'desc' },
      include: {
        locales: true,
        releases: { select: { releaseId: true } },
        _count: {
          select: {
            tags: pageIds.length
              ? { where: { pageID: { in: pageIds } } }
              : true,
          },
        },
      },
    }),
  ])

  const data = rows.map((row) => shapeI18nKeyRow(row))

  return new Pagination(page, limit, total, data)
})
