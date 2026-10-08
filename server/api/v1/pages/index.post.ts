import { authenticateWriteRequest, touchApiToken } from '#server/helper/api-token'
import { readZodBody } from '#server/helper/validate'
import { createPageWithTags } from '#server/helper/api-write'
import type { CreatePageResult } from '#shared/types/Import'

/**
 * @route POST /api/v1/pages
 * @description Import a design frame as a page, with one tag per text layer.
 *
 * Write-scoped token, and the project comes from that token — the URL names no
 * project, so there is no second answer that could disagree with the credential.
 * `image` is the key returned by `POST /api/v1/uploads`.
 */
export default defineEventHandler(async (event): Promise<CreatePageResult> => {
  const token = await authenticateWriteRequest(
    getRequestHeader(event, 'authorization')
  )
  const body = await readZodBody(event, zApiV1PageCreate.parse)
  const result = await createPageWithTags({ projectId: token.projectId, ...body })
  await touchApiToken(token)
  return result
})