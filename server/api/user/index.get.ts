import prisma from '~/libs/prisma'

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
  const user = await prisma.user.findUnique({
    where: {
      id: parseInt(session.user.id + ''),
    },
  })
  return user
})
