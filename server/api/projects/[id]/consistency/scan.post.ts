import { numericID } from '#server/helper/id'
import { requireTeamMember } from '#server/helper/access'
import { requirePlus } from '#server/helper/license'
import { consistencyScans } from '#server/helper/consistency'

/**
 * @route POST /api/projects/:id/consistency/scan
 * @description Start a background scan (or join the one already running) and
 * return its state at once. The page polls GET …/consistency/scan and reloads
 * the report when the scan is no longer running.
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

  return consistencyScans.start(nID)
})
