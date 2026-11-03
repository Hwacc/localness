import { numericID } from '#server/helper/id'
import { requireProjectOwner } from '#server/helper/access'
import { readZodBody } from '#server/helper/validate'
import { renameNamespace, throwNamespaceHttp } from '#server/helper/namespace'
import { zNamespaceRename } from '#shared/schemas'

/**
 * @route PATCH /api/projects/:id/namespaces/:namespaceId
 * @description Rename a namespace. Keys are regrouped by the new name, never renamed.
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
  const { name } = await readZodBody(event, zNamespaceRename.parse)
  try {
    return await renameNamespace({ projectId, namespaceId, name })
  } catch (error) {
    throwNamespaceHttp(error)
  }
})
