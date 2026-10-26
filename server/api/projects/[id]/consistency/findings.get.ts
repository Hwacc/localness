import { numericID } from '#server/helper/id'
import { requireTeamMember } from '#server/helper/access'
import { requirePlus } from '#server/helper/license'
import { readReportFindings } from '#server/helper/consistency-report'
import { zConsistencyFindingsQuery } from '#shared/schemas'

/**
 * @route GET /api/projects/:id/consistency/findings
 * @description One more page ("Show more") of one report category under the
 * same filter as the report head, with the category's current total.
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

  const query = await getValidatedQuery(event, zConsistencyFindingsQuery.parse)
  return readReportFindings(
    nID,
    query.category,
    {
      severities: query.severities,
      locales: query.locales,
      ruleIds: query.ruleIds,
      query: query.q,
    },
    query.offset,
    query.limit
  )
})
