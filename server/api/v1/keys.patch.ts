import { authenticateWriteRequest, touchApiToken } from '#server/helper/api-token'
import { resolveTokenProject } from '#server/helper/api-token-project'
import { readZodBody } from '#server/helper/validate'
import { updateKeyDrafts } from '#server/helper/api-key-write'
import { zApiV1KeyUpdate } from '#shared/schemas'
import type { KeyWriteResult } from '#shared/contract'

/**
 * @route PATCH /api/v1/keys
 * @description Edit a key's drafts, published keys included; publishing stays
 * in the web app. The key is named in the body because names carry `/`. Each
 * locale sends the draft it last read as `expected`; any mismatch is a 409 whose
 * `data` is the current state, and nothing is written.
 */
export default defineEventHandler(async (event): Promise<KeyWriteResult> => {
  const token = await authenticateWriteRequest(
    getRequestHeader(event, 'authorization')
  )
  const projectId = await resolveTokenProject(token, getQuery(event).project)
  const body = await readZodBody(event, zApiV1KeyUpdate.parse)
  const result = await updateKeyDrafts({
    projectId,
    userId: token.createdBy,
    ...body,
  })
  await touchApiToken(token)
  return result
})
