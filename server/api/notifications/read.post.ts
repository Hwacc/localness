import { numericID } from '#server/helper/id'
import { markNotificationsRead } from '#server/helper/notifications'
import { readZodBody } from '#server/helper/validate'
import { zNotificationIds } from '#shared/schemas'

/**
 * @route POST /api/notifications/read
 * @description Mark the current user's notifications read (all, or listed ids)
 */
export default defineEventHandler(async (event) => {
  const session = await requireUserSession(event)
  const userId = numericID(session.user.id)
  const { ids } = await readZodBody(event, zNotificationIds.parse)
  return markNotificationsRead(userId, ids)
})