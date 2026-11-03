import {
  authenticateDeliveryRequest,
  touchApiToken,
} from '#server/helper/api-token'
import { resolveTokenProject } from '#server/helper/api-token-project'
import { deliveryLocale, resolveDeliveryScope } from '#server/helper/api-delivery'
import type { DeliveryLocale } from '#shared/contract'

/** Public read-only delivery API, token-scoped. See `meta.get.ts`. */
export default defineEventHandler(async (event): Promise<DeliveryLocale> => {
  const locale = getRouterParam(event, 'locale')
  if (!locale) {
    throw createError({ statusCode: 400, statusMessage: 'Missing locale' })
  }

  const token = await authenticateDeliveryRequest(
    getRequestHeader(event, 'authorization')
  )
  const query = getQuery(event)
  const projectId = await resolveTokenProject(token, query.project)
  const scope = await resolveDeliveryScope(projectId, query)

  const entries = await deliveryLocale(projectId, locale, scope)

  await touchApiToken(token)
  return entries
})
