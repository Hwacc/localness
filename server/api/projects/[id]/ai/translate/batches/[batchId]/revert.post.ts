import { numericID } from '#server/helper/id'
import { requireTeamMember } from '#server/helper/access'
import { revertAiBatch } from '#server/helper/ai-translate'

/**
 * @route POST /api/projects/:id/ai/translate/batches/:batchId/revert
 * @description Put back what one AI batch replaced. A cell edited since the
 * batch wrote it is left as the person left it (`skipped`). The day's quota is
 * not refunded.
 * @access Private (team member)
 */
export default defineEventHandler(async (event) => {
  const id = getRouterParam(event, 'id')
  const batchId = getRouterParam(event, 'batchId')
  if (!id || !batchId) {
    throw createError({ statusCode: 400, statusMessage: 'Missing id' })
  }
  const nID = numericID(id)
  const { userId } = await requireTeamMember(event, nID)
  return revertAiBatch(batchId, userId, nID)
})
