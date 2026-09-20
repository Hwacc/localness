import { numericID } from '#server/helper/id'
import { requireTeamMember } from '#server/helper/access'
import { listReleases } from '#server/helper/release'

/**
 * @route GET /api/projects/:id/releases
 * @description Release labels for a project.
 *
 * Any Team Member: these are the filter options and the checkbox list on a page
 * or translation, not a privileged roster.
 */
export default defineEventHandler(async (event) => {
  const id = getRouterParam(event, 'id')
  if (!id) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Missing project id',
    })
  }
  const projectId = numericID(id)
  await requireTeamMember(event, projectId)
  return listReleases(projectId)
})