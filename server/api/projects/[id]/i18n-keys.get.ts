import prisma from '#server/libs/prisma'
import { numericID } from '#server/helper/id'
import { requireTeamMember } from '#server/helper/access'

/**
 * @route GET /api/projects/:id/i18n-keys
 * @query q, page, limit
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
  const page = Math.max(1, Number(query.page ?? 1) || 1)
  const limit = Math.min(100, Math.max(1, Number(query.limit ?? 20) || 20))
  const skip = (page - 1) * limit

  const where = {
    projectId: nID,
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

  const data = rows.map((row) => {
    const locales = row.locales.map((locale) => ({
      locale: locale.locale,
      draftText: locale.draftText,
      publishedText: locale.publishedText,
    }))
    const dirty = locales.some(
      (locale) => (locale.draftText ?? '') !== (locale.publishedText ?? '')
    )
    return {
      id: row.id,
      key: row.key,
      origin: row.origin,
      description: row.description,
      updatedAt: row.updatedAt,
      tagCount: row._count.tags,
      dirty,
      locales,
    }
  })

  return new Pagination(page, limit, total, data)
})
