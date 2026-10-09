import { authenticateDeliveryRequest, touchApiToken } from '#server/helper/api-token'
import { resolveTokenProject } from '#server/helper/api-token-project'
import { matchAuthorLayers } from '#server/helper/api-author'
import { readZodBody } from '#server/helper/validate'
import { zApiV1Match } from '#shared/utils/schemas'
import type { AuthorMatch } from '#shared/types/Import'

/**
 * @route POST /api/v1/match
 * @description Which existing keys — draft or published — share each layer's
 * wording. Every hit is returned. A release label does not pick among them.
 */
export default defineEventHandler(async (event): Promise<AuthorMatch> => {
  const token = await authenticateDeliveryRequest(
    getRequestHeader(event, 'authorization')
  )
  const projectId = await resolveTokenProject(token, getQuery(event).project)
  const body = await readZodBody(event, zApiV1Match.parse)
  const result = await matchAuthorLayers(projectId, body.texts)
  await touchApiToken(token)
  return result
})
