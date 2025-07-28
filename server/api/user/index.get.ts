import prisma from '#server/libs/prisma'
import { numericID } from '#server/helper/id'

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
  const id = numericID(session.user.id)
  const user = await prisma.user.findUnique({
    where: { id },
  })
  return user
})
