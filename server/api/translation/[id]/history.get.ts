import { numericID } from '~~/server/helper/id'
import prisma from '~~/server/libs/prisma'
import { requireI18nKeyTeamMember } from '#server/helper/access'

/**
 * @route GET /api/translation/:id/history
 * @param id
 * @description Get translation history list
 * @access Private
 */
export default defineEventHandler(async (event) => {
  const id = getRouterParam(event, 'id')
  if (!id) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Missing id',
    })
  }
  const nID = numericID(id)
  await requireI18nKeyTeamMember(event, nID)
  const history = await prisma.translationLog.findMany({
    where: {
      i18nKeyId: nID,
    },
    orderBy: {
      createdAt: 'desc',
    },
    include: {
      // Never the whole row: it carries the password hash and email.
      user: {
        select: { id: true, username: true, nickname: true, avatar: true },
      },
      i18nKey: true,
    },
  })
  return history.map((row) => ({
    ...row,
    translationID: row.i18nKeyId,
    translation: row.i18nKey,
  }))
})
