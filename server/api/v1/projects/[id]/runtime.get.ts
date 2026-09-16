import { numericID } from '#server/helper/id'
import {
  assertTokenCoversProject,
  authenticateApiToken,
  bearerToken,
  throwPublicError,
  touchApiToken,
} from '#server/helper/api-token'
import {
  deliveryRuntime,
  projectLocales,
  resolveReleaseParam,
} from '#server/helper/api-delivery'

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

  const presented = bearerToken(getRequestHeader(event, 'authorization'))
  let token
  try {
    token = await authenticateApiToken(presented)
    assertTokenCoversProject(token, projectId)
  } catch (error) {
    throwPublicError(error)
  }

  let releaseId: number | null = null
  try {
    releaseId = await resolveReleaseParam(
      projectId,
      getQuery(event).release
    )
  } catch (error) {
    throwPublicError(error)
  }

  const locales = await projectLocales(projectId)
  const bundle = await deliveryRuntime(projectId, releaseId, locales)

  await touchApiToken(token.id)
  return bundle
})
