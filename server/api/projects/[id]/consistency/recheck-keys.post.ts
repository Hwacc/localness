import { numericID } from '#server/helper/id'
import { requireTeamMember } from '#server/helper/access'
import { requirePlus } from '#server/helper/license'
import { recheckSnapshotKeys } from '#server/helper/consistency'
import { zConsistencyRecheckKeys } from '#shared/schemas'

/**
 * @route POST /api/projects/:id/consistency/recheck-keys
 * @description Redo the single-key rules for keys the Resolve drawer just
 * wrote and patch the snapshot, so the report is right for them before the
 * full background scan (which the page still starts) finishes.
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

  const { keyIds } = await readValidatedBody(event, zConsistencyRecheckKeys.parse)
  await recheckSnapshotKeys(nID, keyIds)
  return { ok: true }
})
