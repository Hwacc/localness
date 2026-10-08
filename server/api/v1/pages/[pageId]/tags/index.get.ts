import { numericID } from '#server/helper/id'
import { authenticateWriteRequest, touchApiToken } from '#server/helper/api-token'
import { listPageTags } from '#server/helper/api-write'
import type { ImportPageTags } from '#shared/types/Import'

/**
 * @route GET /api/v1/pages/:pageId/tags
 * @description What an importer reads before deciding what to update. Needs a
 * write token even though it only reads: it exists to serve the import loop, and
 * a read token has no import to serve.
 */
export default defineEventHandler(async (event): Promise<ImportPageTags> => {
  const token = await authenticateWriteRequest(
    getRequestHeader(event, 'authorization')
  )
  const pageId = getRouterParam(event, 'pageId')
  if (!pageId) {
    throw createError({ statusCode: 400, statusMessage: 'Missing page id' })
  }
  const result = await listPageTags(token.projectId, numericID(pageId))
  await touchApiToken(token)
  return result
})