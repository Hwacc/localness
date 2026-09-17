import {
  authenticateDeliveryRequest,
  touchApiToken,
} from '#server/helper/api-token'
import { deliveryLocale, resolveReleaseParam } from '#server/helper/api-delivery'

/** Public read-only delivery API, token-scoped. See `meta.get.ts`. */
export default defineEventHandler(async (event) => {
  const locale = getRouterParam(event, 'locale')
  if (!locale) {
    throw createError({ statusCode: 400, statusMessage: 'Missing locale' })
  }

  const token = await authenticateDeliveryRequest(
    getRequestHeader(event, 'authorization')
  )
  const releaseId = await resolveReleaseParam(
    token.projectId,
    getQuery(event).release
  )

  const entries = await deliveryLocale(token.projectId, locale, releaseId)

  await touchApiToken(token)
  return entries
})
