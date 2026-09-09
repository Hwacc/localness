import prisma from '#server/libs/prisma'
import { numericID } from '#server/helper/id'
import { shapeI18nKey } from '#server/helper/i18n'

/**
 * @route GET /api/translation/search
 * @description Search I18nKey.origin via FTS
 * @access Private
 */
export default defineEventHandler(async (event) => {
  const session = await requireUserSession(event)
  const userId = numericID(session.user.id)
  const { keyword, page = 1, limit = 10 } = getQuery(event)
  if (!keyword) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Missing keyword',
    })
  }

  const memberships = await prisma.userTeam.findMany({
    where: { userId },
    select: { teamId: true },
  })
  const teamIds = memberships.map((m) => m.teamId)

  const offset = (Number(page ?? 1) - 1) * Number(limit)

  const count = await prisma.$queryRawUnsafe<any[]>(
    `SELECT COUNT(*) FROM I18nKey_FTS WHERE I18nKey_FTS MATCH ?`,
    keyword
  )
  if (count.length === 0) return new Pagination(1, Number(limit), 0, [])

  const rows = await prisma.$queryRawUnsafe<any[]>(
    `SELECT rowid FROM I18nKey_FTS WHERE I18nKey_FTS MATCH ? LIMIT ? OFFSET ?`,
    keyword,
    Number(limit),
    offset
  )

  const ids = rows.map((row: any) => row.rowid)
  const records = await prisma.i18nKey.findMany({
    where: {
      id: { in: ids },
      project: { teamId: { in: teamIds } },
    },
    include: { locales: true },
  })
  const pagination = new Pagination(
    Number(page ?? 1),
    Number(limit),
    Number(count[0]['COUNT(*)']),
    records.map((r) => shapeI18nKey(r))
  )
  return pagination
})
