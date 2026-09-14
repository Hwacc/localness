import { numericID } from '#server/helper/id'
import { markNotificationsRead } from '#server/helper/notifications'
import { readZodBody } from '#server/helper/validate'
import { z } from 'zod/v4'

const zRead = z.object({
  ids: z.array(z.number().int().positive()).optional(),
})

/**
 * @route POST /api/notifications/read
 * @description Mark the current user's notifications read (all, or listed ids)
 */
export default defineEventHandler(async (event) => {
  const session = await requireUserSession(event)
  const userId = numericID(session.user.id)
  const { ids } = await readZodBody(event, zRead.parse)
  return markNotificationsRead(userId, ids)
})
