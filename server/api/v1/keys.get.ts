import { authenticateDeliveryRequest, touchApiToken } from '#server/helper/api-token'
import { resolveTokenProject } from '#server/helper/api-token-project'
import { deliveryKeys, resolveDeliveryScope } from '#server/helper/api-delivery'
import type { DeliveryKeys } from '#shared/contract'

/** Public read-only delivery API, token-scoped. Names only — see `DeliveryKeys`. */
export default defineEventHandler(async (event): Promise<DeliveryKeys> => {
  const token = await authenticateDeliveryRequest(
    getRequestHeader(event, 'authorization')
  )
  const query = getQuery(event)
  const projectId = await resolveTokenProject(token, query.project)
  const scope = await resolveDeliveryScope(projectId, query)

  const keys = await deliveryKeys(projectId, scope)

  await touchApiToken(token)
  return { keys, generatedAt: new Date().toISOString() }
})