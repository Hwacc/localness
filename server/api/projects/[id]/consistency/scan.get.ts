import { numericID } from '#server/helper/id'
import { requireTeamMember } from '#server/helper/access'
import { requirePlus } from '#server/helper/license'
import { consistencyScans } from '#server/helper/consistency'

/**
 * @route GET /api/projects/:id/consistency/scan
 * @description The project's background scan state: idle, running (phase and
 * rule progress) or failed (last error, until the next start).
 * @access Private (team member, Plus license)
 */
export default defineEventHandler(async (event) => {
  const id = getRouterParam(event, 'id')
  if (!id) {
    throw createError({ statusCode: 400, statusMessage: 'Missing id' })
  }
  const nID = numericID(id)
  await requireTeamMember(event, nID)
  requirePlus()

  return consistencyScans.status(nID)
})
