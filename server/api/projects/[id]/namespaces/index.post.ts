import { numericID } from '#server/helper/id'
import { requireProjectOwner } from '#server/helper/access'
import { readZodBody } from '#server/helper/validate'
import { createNamespace, throwNamespaceHttp } from '#server/helper/namespace'
import { zNamespaceCreate } from '#shared/schemas'

/**
 * @route POST /api/projects/:id/namespaces
 * @description Declare a key namespace. Project Owner, like release labels.
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
  await requireProjectOwner(event, projectId)
  const { name } = await readZodBody(event, zNamespaceCreate.parse)
  try {
    return await createNamespace({ projectId, name })
  } catch (error) {
    throwNamespaceHttp(error)
  }
})
