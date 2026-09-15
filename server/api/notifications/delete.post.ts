import { numericID } from '#server/helper/id'
import { deleteNotifications } from '#server/helper/notifications'
import { readZodBody } from '#server/helper/validate'
import { zNotificationIds } from '#shared/utils/schemas'

/**
 * @route POST /api/notifications/delete
 * @description Remove the current user's notifications (all, or listed ids)
 */
export default defineEventHandler(async (event) => {
  const session = await requireUserSession(event)
  const userId = numericID(session.user.id)
  const { ids } = await readZodBody(event, zNotificationIds.parse)
  return deleteNotifications(userId, ids)
})