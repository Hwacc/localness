import { numericID } from '#server/helper/id'
import { authenticateWriteRequest, touchApiToken } from '#server/helper/api-token'
import { requireTokenPageAccess } from '#server/helper/api-token-project'
import { readZodBody } from '#server/helper/validate'
import { upsertPageWithTags } from '#server/helper/api-write'
import type { ImportPageResult } from '#shared/types/Import'

/**
 * @route PATCH /api/v1/pages/:pageId
 * @description Re-import: geometry follows the design, the binding stays the
 * editor's, and nothing is deleted. Tags whose node was absent from the request
 * come back as `stale`.
 *
 * The page carries the project, so this route never names one. A page the
 * credential was not granted is a 404 — the same answer as a page that does not
 * exist, because the caller has no business learning which it is.
 *
 * The project handed to the helper is re-verified there, and reads as redundant
 * from here. It is left in place on purpose: the helper's own contract should
 * not depend on every caller having done the check first.
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
  const { projectId } = await requireTokenPageAccess(
    token,
    numericID(pageId),
    getQuery(event).project
  )
  const result = await upsertPageWithTags({
    projectId,
    pageId: numericID(pageId),
    ...body,
  })
  await touchApiToken(token)
  return result
})