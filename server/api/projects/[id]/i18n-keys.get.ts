import prisma from '#server/libs/prisma'
import { numericID } from '#server/helper/id'
import { requireTeamMember } from '#server/helper/access'
import { shapeI18nKeyRow } from '#server/helper/i18n'
import { I18nKeyStatusFilter } from '#shared/constants'

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

/**
 * @route GET /api/projects/:id/i18n-keys
 * @query q, status, from, to, page, limit
 * `from`/`to` are ISO instants bounding `updatedAt`; the client sends the
 * local day boundaries so the range means what the user picked on screen.
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
      return new Pagination(page, limit, 0, [])
    }
  }

  const where = {
    projectId: nID,
    ...(statusIds ? { id: { in: statusIds } } : {}),
    ...(from || to
      ? {
          updatedAt: {
            ...(from ? { gte: from } : {}),
            ...(to ? { lte: to } : {}),
          },
        }
      : {}),
    ...(q
      ? {
          OR: [
            { key: { contains: q } },
            { origin: { contains: q } },
          ],
        }
      : {}),
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
        _count: { select: { tags: true } },
      },
    }),
  ])

  const data = rows.map((row) => shapeI18nKeyRow(row))

  return new Pagination(page, limit, total, data)
})
