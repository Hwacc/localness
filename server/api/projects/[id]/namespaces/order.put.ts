import { numericID } from '#server/helper/id'
import { requireProjectOwner } from '#server/helper/access'
import { readZodBody } from '#server/helper/validate'
import { reorderNamespaces, throwNamespaceHttp } from '#server/helper/namespace'
import { zNamespaceOrder } from '#shared/schemas'

/**
 * @route PUT /api/projects/:id/namespaces/order
 * @description Set the display order. The body lists every namespace id once.
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
  const { ids } = await readZodBody(event, zNamespaceOrder.parse)
  try {
    return await reorderNamespaces({ projectId, ids })
  } catch (error) {
    throwNamespaceHttp(error)
  }
})
