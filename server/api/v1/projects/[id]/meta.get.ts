import { numericID } from '#server/helper/id'
import {
  authenticateDeliveryRequest,
  touchApiToken,
} from '#server/helper/api-token'
import { deliveryMeta, resolveReleaseParam } from '#server/helper/api-delivery'

/**
 * Public read-only delivery API. Kept in `/api/v1` rather than reusing the UI
 * routes, which are session-scoped and must stay free to change without
 * breaking an external caller. Published copy only: `version` is deliberately
 * absent, so a draft is never reachable with a token.
 */
export default defineEventHandler(async (event) => {
  const id = getRouterParam(event, 'id')
  if (!id) {
    throw createError({ statusCode: 400, statusMessage: 'Missing project id' })
  }
  const projectId = numericID(id)

  const token = await authenticateDeliveryRequest(
    getRequestHeader(event, 'authorization'),
    projectId
  )
  const releaseId = await resolveReleaseParam(
    projectId,
    getQuery(event).release
  )

  const result = await deliveryMeta(projectId, releaseId)
  if (!result) {
    throw createError({ statusCode: 404, statusMessage: 'Project not found' })
  }

  await touchApiToken(token)
  return result
})
