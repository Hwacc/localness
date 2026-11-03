import { numericID } from '#server/helper/id'
import { requireTeamMember } from '#server/helper/access'
import { listNamespaces } from '#server/helper/namespace'

/**
 * @route GET /api/projects/:id/namespaces
 * @description Key namespaces for a project, in display order.
 *
 * Any Team Member: these are the groups of the Translations list.
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
  return listNamespaces(projectId)
})
