import {
  authenticateDeliveryRequest,
  touchApiToken,
} from '#server/helper/api-token'
import { resolveTokenProject } from '#server/helper/api-token-project'
import {
  deliveryBundle,
  projectLocales,
  resolveDeliveryScope,
} from '#server/helper/api-delivery'
import type { DeliveryBundle } from '#shared/contract'

/** Public read-only delivery API, token-scoped. See `meta.get.ts`. */
export default defineEventHandler(async (event): Promise<DeliveryBundle> => {
  const token = await authenticateDeliveryRequest(
    getRequestHeader(event, 'authorization')
  )
  const query = getQuery(event)
  const projectId = await resolveTokenProject(token, query.project)
  const scope = await resolveDeliveryScope(projectId, query)
  const locales = await projectLocales(projectId)

  await touchApiToken(token)
  return deliveryBundle(projectId, scope, locales)
})
