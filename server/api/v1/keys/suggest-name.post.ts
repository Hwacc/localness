import { authenticateWriteRequest, touchApiToken } from '#server/helper/api-token'
import { resolveTokenProject } from '#server/helper/api-token-project'
import { readZodBody } from '#server/helper/validate'
import { buildKeySuggestion, rethrowAsHttp } from '#server/helper/key-suggestion'
import { zApiV1KeySuggestName } from '#shared/schemas'
import type { KeyNameSuggestion } from '#shared/contract'

/**
 * @route POST /api/v1/keys/suggest-name
 * @description The web app's AI key naming for a piece of text, under the
 * project's key convention (project → default, as for an entry: there is no
 * page). Write scope, because it spends the project's AI quota. Writes nothing.
 */
export default defineEventHandler(async (event): Promise<KeyNameSuggestion> => {
  const token = await authenticateWriteRequest(
    getRequestHeader(event, 'authorization')
  )
  const projectId = await resolveTokenProject(token, getQuery(event).project)
  const { sourceText } = await readZodBody(event, zApiV1KeySuggestName.parse)
  let suggestion: KeyNameSuggestion
  try {
    suggestion = await buildKeySuggestion({ projectId, sourceText })
  } catch (error) {
    rethrowAsHttp(error)
  }
  await touchApiToken(token)
  return suggestion
})
