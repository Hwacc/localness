import { numericID } from '#server/helper/id'
import { requireProjectOwner } from '#server/helper/access'
import { deleteNamespace, throwNamespaceHttp } from '#server/helper/namespace'

/**
 * @route DELETE /api/projects/:id/namespaces/:namespaceId
 * @description Drop a namespace. Its keys are untouched and fall back to Ungrouped.
 */
export default defineEventHandler(async (event) => {
  const id = getRouterParam(event, 'id')
  const namespaceIdParam = getRouterParam(event, 'namespaceId')
  if (!id || !namespaceIdParam) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Missing id',
    })
  }
  const projectId = numericID(id)
  const namespaceId = numericID(namespaceIdParam)
  await requireProjectOwner(event, projectId)
  try {
    return await deleteNamespace({ projectId, namespaceId })
  } catch (error) {
    throwNamespaceHttp(error)
  }
})
