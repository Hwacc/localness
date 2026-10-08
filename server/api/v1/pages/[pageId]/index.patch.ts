import { numericID } from '#server/helper/id'
import { authenticateWriteRequest, touchApiToken } from '#server/helper/api-token'
import { readZodBody } from '#server/helper/validate'
import { upsertPageWithTags } from '#server/helper/api-write'
import type { ImportPageResult } from '#shared/types/Import'

/**
 * @route PATCH /api/v1/pages/:pageId
 * @description Re-import: geometry follows the design, the binding stays the
 * editor's, and nothing is deleted. Tags whose node was absent from the request
 * come back as `stale`.
 *
 * The page id is checked against the token's project, so a page of another
 * project is a 404 rather than something this credential can reach.
 */
export default defineEventHandler(async (event): Promise<ImportPageResult> => {
  const token = await authenticateWriteRequest(
    getRequestHeader(event, 'authorization')
  )
  const pageId = getRouterParam(event, 'pageId')
  if (!pageId) {
    throw createError({ statusCode: 400, statusMessage: 'Missing page id' })
  }
  const body = await readZodBody(event, zApiV1PageUpdate.parse)
  const result = await upsertPageWithTags({
    projectId: token.projectId,
    pageId: numericID(pageId),
    ...body,
  })
  await touchApiToken(token)
  return result
})