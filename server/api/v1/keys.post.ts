import {
  authenticateWriteRequest,
  touchApiToken,
} from '#server/helper/api-token'
import { resolveTokenProject } from '#server/helper/api-token-project'
import { readZodBody } from '#server/helper/validate'
import {
  CLIENT_HEADER,
  createKeyFromSource,
  writeClientOf,
} from '#server/helper/api-key-write'
import { zApiV1KeyCreate } from '#shared/schemas'
import type { KeyWriteResult } from '#shared/contract'

/**
 * @route POST /api/v1/keys
 * @description Create a key from text in code. A named key publishes the text
 * as its source language — it is already live in that code. Without `key` it
 * is the text's `__unnamed_` key, a draft only, reused if the text already has
 * one; a named key the project already has is a 409, and a new name that
 * breaks the project's key convention a 400. `releaseId` labels the
 * key only when this request creates it.
 */
export default defineEventHandler(async (event): Promise<KeyWriteResult> => {
  const token = await authenticateWriteRequest(
    getRequestHeader(event, 'authorization'),
  )
  const projectId = await resolveTokenProject(token, getQuery(event).project)
  const body = await readZodBody(event, zApiV1KeyCreate.parse)
  const result = await createKeyFromSource({
    projectId,
    userId: token.createdBy,
    via: writeClientOf(getRequestHeader(event, CLIENT_HEADER)),
    ...body,
  })
  await touchApiToken(token)
  return result
})
