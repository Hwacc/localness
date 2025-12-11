import prisma from '#server/libs/prisma'

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
    `SELECT COUNT(*) FROM Translation_FTS WHERE Translation_FTS MATCH ?`,
    keyword
  )
  if (count.length === 0) return new Pagination(1, Number(limit), 0, [])


  console.log('search', keyword, Number(limit), offset)
  const rows = await prisma.$queryRawUnsafe<any[]>(
    `SELECT rowid FROM Translation_FTS WHERE Translation_FTS MATCH ? LIMIT ? OFFSET ?`,
    keyword,
    Number(limit),
    offset
  )
  
  const ids = rows.map((row: any) => row.rowid)
  const translations = await prisma.translation.findMany({
    where: {
      id: {
        in: ids,
      },
    },
    include: {
      vue: true,
      react: true,
    }
  })
  const pagination = new Pagination(
    Number(page ?? 1),
    Number(limit),
    Number(count[0]['COUNT(*)']),
    translations
  )
  return pagination
})
