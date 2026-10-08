import { numericID } from '#server/helper/id'
import { authenticateWriteRequest, touchApiToken } from '#server/helper/api-token'
import { readZodBody } from '#server/helper/validate'
import { deletePageTags } from '#server/helper/api-write'
import type { DeleteTagsResult } from '#shared/types/Import'

/**
 * @route POST /api/v1/pages/:pageId/tags/delete
 * @description The explicit cleanup for tags an importer reported as stale.
 * Deliberately not folded into `PATCH` — deleting a tag throws away whatever key
 * and translation a person attached to it, so it only ever happens on a request
 * whose whole purpose is that.
 *
 * `POST` with a body rather than `DELETE`, matching the batch action on the
 * inbox. Nitro picks the verb from the filename, so the method is not the point
 * of the route; the id list is.
 */
export default defineEventHandler(async (event): Promise<DeleteTagsResult> => {
  const token = await authenticateWriteRequest(
    getRequestHeader(event, 'authorization')
  )
  const pageId = getRouterParam(event, 'pageId')
  if (!pageId) {
    throw createError({ statusCode: 400, statusMessage: 'Missing page id' })
  }
  const body = await readZodBody(event, zApiV1TagDelete.parse)
  const result = await deletePageTags({
    projectId: token.projectId,
    pageId: numericID(pageId),
    tagIds: body.tagIds,
  })
  await touchApiToken(token)
  return result
})