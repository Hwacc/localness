import { numericID } from '#server/helper/id'
import { requireTeamMember } from '#server/helper/access'
import { requirePlus } from '#server/helper/license'
import { readIgnoredFindings } from '#server/helper/consistency-report'
import { zConsistencyIgnoredQuery } from '#shared/utils/schemas'

/**
 * @route GET /api/projects/:id/consistency/ignored
 * @description One page of the whitelisted ("Not an issue") findings of the
 * latest snapshot, so the page can offer a restore. Unfiltered.
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

  const { offset, limit } = await getValidatedQuery(
    event,
    zConsistencyIgnoredQuery.parse
  )
  return readIgnoredFindings(nID, offset, limit)
})
