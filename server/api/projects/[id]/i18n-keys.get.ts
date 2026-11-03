import prisma from '#server/libs/prisma'
import { numericID } from '#server/helper/id'
import { requireTeamMember } from '#server/helper/access'
import { shapeI18nKeyRow } from '#server/helper/i18n'
import {
  i18nKeyListWhere,
  parseI18nKeyListFilters,
} from '#server/helper/i18n-key-list'

/**
 * @route GET /api/projects/:id/i18n-keys
 * @query q, status, from, to, pageIds, ids, releaseId, unassigned, namespaceId, ungrouped, includeDraftKeys, idsOnly, page, limit
 * `from`/`to` are ISO instants bounding `updatedAt`; the client sends the
 * local day boundaries so the range means what the user picked on screen.
 * `pageIds` scopes to keys tagged on those pages, plus keys with no tag at all
 * (a plain translation entry is still exportable); `tagCount` is then counted
 * within that scope. `releaseId` / `unassigned=1` scope to release labels and
 * `namespaceId` / `ungrouped=1` to key namespaces the same way. `idsOnly=1`
 * returns every matching id without paging, so the export picker can "select
 * all matching" for one release.
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
  const filters = parseI18nKeyListFilters(query)
  const idsOnly = query.idsOnly === 'true' || query.idsOnly === '1'
  const page = Math.max(1, Number(query.page ?? 1) || 1)
  const limit = Math.min(100, Math.max(1, Number(query.limit ?? 20) || 20))
  const skip = (page - 1) * limit

  const where = await i18nKeyListWhere(nID, filters)
  if (!where) {
    return idsOnly ? { ids: [] } : new Pagination(page, limit, 0, [])
  }

  if (idsOnly) {
    const ids = await prisma.i18nKey.findMany({
      where,
      orderBy: { updatedAt: 'desc' },
      select: { id: true },
    })
    return { ids: ids.map((row) => row.id) }
  }

  const { pageIds } = filters
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