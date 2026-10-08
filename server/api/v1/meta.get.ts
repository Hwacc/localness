import {
  authenticateDeliveryRequest,
  touchApiToken,
} from '#server/helper/api-token'
import { resolveTokenProject } from '#server/helper/api-token-project'
import { deliveryMeta, resolveReleaseParam } from '#server/helper/api-delivery'

/**
 * Public read-only delivery API. Kept in `/api/v1` rather than reusing the UI
 * routes, which are session-scoped, draft-aware, and paginated — those must stay
 * free to change without breaking an external caller.
 *
 * A token belongs to a person and may name several projects, so the project is
 * `?project=` whenever the credential alone cannot answer it — which for a
 * single-project token is never, so those callers are unchanged. `meta` remains
 * the entry point a fresh consumer starts from: a caller holding nothing but a
 * token learns here what it can serve.
 *
 * One shape per endpoint: `/meta` never returns a project *list*. When the
 * credential is ambiguous it says so and points at `GET /api/v1/projects`.
 * Published copy only: a draft is never reachable with a token.
 */
export default defineEventHandler(async (event) => {
  const token = await authenticateDeliveryRequest(
    getRequestHeader(event, 'authorization')
  )
  const query = getQuery(event)
  const projectId = await resolveTokenProject(token, query.project)
  const releaseId = await resolveReleaseParam(projectId, query.release)

  const result = await deliveryMeta(projectId, releaseId)
  if (!result) {
    throw createError({ statusCode: 404, statusMessage: 'Project not found' })
  }

  await touchApiToken(token)
  return result
})
