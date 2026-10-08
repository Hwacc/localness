import {
  authenticateDeliveryRequest,
  touchApiToken,
} from '#server/helper/api-token'
import { resolveTokenProject } from '#server/helper/api-token-project'
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
  const query = getQuery(event)
  const projectId = await resolveTokenProject(token, query.project)
  const releaseId = await resolveReleaseParam(projectId, query.release)
  const locales = await projectLocales(projectId)

  await touchApiToken(token)
  return deliveryBundle(projectId, releaseId, locales)
})
