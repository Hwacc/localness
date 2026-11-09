import { numericID } from '#server/helper/id'
import { requireProjectOwner } from '#server/helper/access'
import { projectDeleteSummary } from '#server/helper/project-delete'

/**
 * @route GET /api/projects/:id/delete-summary
 * @description What deleting this project would take with it (Project Owner).
 */
export default defineEventHandler(async (event) => {
  const id = getRouterParam(event, 'id')
  if (!id) {
    throw createError({ statusCode: 400, statusMessage: 'Missing id' })
  }
  const projectId = numericID(id)
  await requireProjectOwner(event, projectId)
  const summary = await projectDeleteSummary(projectId)
  if (!summary) {
    throw createError({ statusCode: 404, statusMessage: 'Project not found' })
  }
  return summary
})
