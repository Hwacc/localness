import { numericID } from '#server/helper/id'
import { requireTeamMember } from '#server/helper/access'
import { listOpenConflicts } from '#server/libs/git-sync/sync'

/**
 * @route GET /api/projects/:id/git-sync/conflicts
 */
export default defineEventHandler(async (event) => {
  const id = getRouterParam(event, 'id')
  if (!id) {
    throw createError({ statusCode: 400, statusMessage: 'Missing project id' })
  }
  const projectId = numericID(id)
  await requireTeamMember(event, projectId)
  return listOpenConflicts(projectId)
})
