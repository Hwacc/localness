import {
  authenticateDeliveryRequest,
  touchApiToken,
} from '#server/helper/api-token'
import {
  deliveryBundle,
  projectLocales,
  resolveReleaseParam,
} from '#server/helper/api-delivery'

/** Public read-only delivery API, token-scoped. See `meta.get.ts`. */
export default defineEventHandler(async (event) => {
  const token = await authenticateDeliveryRequest(
    getRequestHeader(event, 'authorization')
  )
  const releaseId = await resolveReleaseParam(
    token.projectId,
    getQuery(event).release
  )
  const locales = await projectLocales(token.projectId)

  await touchApiToken(token)
  return deliveryBundle(token.projectId, releaseId, locales)
})
