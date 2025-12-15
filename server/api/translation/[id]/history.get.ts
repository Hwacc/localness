import { numericID } from '~~/server/helper/id'
import prisma from '~~/server/libs/prisma'

/**
 * @route GET /api/translation/:id/history
 * @param id
 * @description Get translation history list
 * @access Private
 */
export default defineEventHandler(async (event) => {
  await requireUserSession(event)

  const id = getRouterParam(event, 'id')
  if (!id) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Missing id',
    })
  }
  const nID = numericID(id)
  const history = await prisma.translationLog.findMany({
    where: {
      translationID: nID,
    },
    orderBy: {
      createdAt: 'desc',
    },
    include: {
      user: true,
      translation: true,
    },
  })
  return history
})
