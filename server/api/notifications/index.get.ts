import { numericID } from '#server/helper/id'
import { listNotifications } from '#server/helper/notifications'

/**
 * @route GET /api/notifications
 * @query pending=1 — only pending rows (badge / poll)
 */
export default defineEventHandler(async (event) => {
  const session = await requireUserSession(event)
  const userId = numericID(session.user.id)
  const query = getQuery(event)
  const pendingOnly = query.pending === '1' || query.pending === 'true'
  return listNotifications(userId, { pendingOnly })
})
