import prisma from '~/server/libs/prisma'
import { numericID } from '~/utils/id'

/**
 * @route GET /api/user
 * @description Get current user
 * @access Private
 */
export default defineEventHandler(async (event) => {
  const session = await requireUserSession(event)
  if (!session.user) {
    throw createError({
      statusCode: 401,
      statusMessage: 'Unauthorized',
    })
  }
  const nID = numericID(session.user.id)
  if (isNaN(nID)) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Invalid id format',
    })
  }
  const user = await prisma.user.findUnique({
    where: {
      id: nID,
    },
  })
  return user
})
