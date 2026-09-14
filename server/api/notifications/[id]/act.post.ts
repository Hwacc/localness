import { numericID } from '#server/helper/id'
import {
  actOnNotification,
  throwNotificationHttp,
} from '#server/helper/notifications'
import { readZodBody } from '#server/helper/validate'
import { zNotificationAct } from '#shared/utils/schemas'

/**
 * @route POST /api/notifications/:id/act
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
  const { action } = await readZodBody(event, zNotificationAct.parse)
  try {
    return await actOnNotification({
      userId,
      notificationId: numericID(id),
      action,
    })
  } catch (error) {
    throwNotificationHttp(error)
  }
})
