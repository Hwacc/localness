import { numericID } from '#server/helper/id'
import { loadPublicUser } from '#server/helper/atlassian-auth'

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
  const user = await loadPublicUser(numericID(session.user.id))
  if (!user) {
    throw createError({
      statusCode: 404,
      statusMessage: 'User not found',
    })
  }
  return user
})
