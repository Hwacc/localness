import prisma from '~/server/libs/prisma'

/**
 * @route GET /api/translation/search
 * @description Search translations
 * @access Private
 */
export default defineEventHandler(async (event) => {
  await requireUserSession(event)
  const { keyword, page } = getQuery(event)
  if (!keyword) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Missing keyword',
    })
  }

  const limit = 10
  const offset = (Number(page ?? 1) - 1) * limit

  const count = await prisma.$queryRawUnsafe<number>(
    `SELECT COUNT(*) FROM Translation_FTS WHERE Translation_FTS MATCH $1`,
    keyword
  )
  if (count === 0) return []
  
  const totalPage = Math.ceil(count / limit)
  const rows = await prisma.$queryRawUnsafe<any[]>(
    `SELECT rowid FROM Translation_FTS WHERE Translation_FTS MATCH $1 LIMIT $2 OFFSET $3`,
    keyword,
    limit,
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
  return translations
})
