import { numericID } from '#server/helper/id'
import { authenticateDeliveryRequest, touchApiToken } from '#server/helper/api-token'
import { requireTokenPageAccess } from '#server/helper/api-token-project'
import { readCapturePage } from '#server/helper/api-capture'
import type { CapturePage } from '#shared/types/Import'

/**
 * @route GET /api/v1/pages/:pageId
 * @description The page Capture reads back: draft source text and release labels.
 * Published delivery stays on `/bundle`. A page the token cannot reach is a 404.
 */
export default defineEventHandler(async (event): Promise<CapturePage> => {
  const token = await authenticateDeliveryRequest(
    getRequestHeader(event, 'authorization')
  )
  const pageId = getRouterParam(event, 'pageId')
  if (!pageId) {
    throw createError({ statusCode: 400, statusMessage: 'Missing page id' })
  }
  const id = numericID(pageId)
  const { projectId } = await requireTokenPageAccess(token, id, getQuery(event).project)
  const result = await readCapturePage(projectId, id)
  await touchApiToken(token)
  return result
})
