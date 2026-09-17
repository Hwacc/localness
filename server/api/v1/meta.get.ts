import {
  authenticateDeliveryRequest,
  touchApiToken,
} from '#server/helper/api-token'
import { deliveryMeta, resolveReleaseParam } from '#server/helper/api-delivery'

/**
 * Public read-only delivery API. Kept in `/api/v1` rather than reusing the UI
 * routes, which are session-scoped, draft-aware, and paginated — those must stay
 * free to change without breaking an external caller.
 *
 * Token-scoped: the credential names the project, so the URL does not. That is
 * why `meta` below is the entry point a fresh consumer starts from — it is how a
 * caller that holds nothing but a token learns which project it is serving.
 * Published copy only: a draft is never reachable with a token.
 */
export default defineEventHandler(async (event) => {
  const token = await authenticateDeliveryRequest(
    getRequestHeader(event, 'authorization')
  )
  const releaseId = await resolveReleaseParam(
    token.projectId,
    getQuery(event).release
  )

  const result = await deliveryMeta(token.projectId, releaseId)
  if (!result) {
    throw createError({ statusCode: 404, statusMessage: 'Project not found' })
  }

  await touchApiToken(token)
  return result
})
