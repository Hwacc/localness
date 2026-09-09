import { numericID } from '#server/helper/id'
import { requireTeamMember } from '#server/helper/access'
import { pullProject } from '#server/libs/git-sync/sync'

/**
 * @route POST /api/projects/:id/git-sync/pull
 */
export default defineEventHandler(async (event) => {
  const id = getRouterParam(event, 'id')
  if (!id) {
    throw createError({ statusCode: 400, statusMessage: 'Missing project id' })
  }
  const projectId = numericID(id)
  await requireTeamMember(event, projectId)
  return pullProject(projectId)
})
