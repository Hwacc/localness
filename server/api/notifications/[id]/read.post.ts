import { numericID } from '#server/helper/id'
import { markNotificationsRead } from '#server/helper/notifications'

/**
 * @route POST /api/notifications/:id/read
 */
export default defineEventHandler(async (event) => {
  const session = await requireUserSession(event)
  const userId = numericID(session.user.id)
  const id = getRouterParam(event, 'id')
  if (!id) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Missing notification id',
    })
  }
  return markNotificationsRead(userId, [numericID(id)])
})
