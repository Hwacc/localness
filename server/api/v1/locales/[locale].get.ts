import {
  authenticateDeliveryRequest,
  touchApiToken,
} from '#server/helper/api-token'
import { resolveTokenProject } from '#server/helper/api-token-project'
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
  const query = getQuery(event)
  const projectId = await resolveTokenProject(token, query.project)
  const releaseId = await resolveReleaseParam(projectId, query.release)

  const entries = await deliveryLocale(projectId, locale, releaseId)

  await touchApiToken(token)
  return entries
})
