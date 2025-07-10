import prisma from '~/server/libs/prisma'
import { Pagination } from '~/types/Pagination'

/**
 * @route GET /api/translation/search
 * @description Search translations
 * @access Private
 */
export default defineEventHandler(async (event) => {
  await requireUserSession(event)
  const { keyword, page = 1, limit = 10 } = getQuery(event)
  if (!keyword) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Missing keyword',
    })
  }

  const offset = (Number(page ?? 1) - 1) * Number(limit)

  const count = await prisma.$queryRawUnsafe<any[]>(
    `SELECT COUNT(*) FROM Translation_FTS WHERE Translation_FTS MATCH $1`,
    keyword
  )
  if (count.length === 0) return new Pagination(1, Number(limit), 0, [])

  const rows = await prisma.$queryRawUnsafe<any[]>(
    `SELECT rowid FROM Translation_FTS WHERE Translation_FTS MATCH $1 LIMIT $2 OFFSET $3`,
    keyword,
    Number(limit),
    offset
  )
  const ids = rows.map((row) => row.rowid)
  const translations = await prisma.translation.findMany({
    where: {
      id: {
        in: ids,
      },
    },
  })
  const pagination = new Pagination(
    Number(page ?? 1),
    Number(limit),
    Number(count[0]['COUNT(*)']),
    translations
  )
  return pagination
})
