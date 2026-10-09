import { authenticateDeliveryRequest, touchApiToken } from '#server/helper/api-token'
import { resolveTokenProject } from '#server/helper/api-token-project'
import { searchAuthorKeys } from '#server/helper/api-author'
import type { AuthorKeySearch } from '#shared/types/Import'

/**
 * @route GET /api/v1/keys/search
 * @description Key names and source text for a picker, drafts included.
 * `GET /api/v1/keys` stays the published-name list a consumer uses.
 */
export default defineEventHandler(async (event): Promise<AuthorKeySearch> => {
  const token = await authenticateDeliveryRequest(
    getRequestHeader(event, 'authorization')
  )
  const query = getQuery(event)
  const projectId = await resolveTokenProject(token, query.project)
  const limit = typeof query.limit === 'string' ? Number(query.limit) : undefined
  const offset = typeof query.offset === 'string' ? Number(query.offset) : undefined
  const result = await searchAuthorKeys({
    projectId,
    query: typeof query.q === 'string' ? query.q : '',
    limit: Number.isFinite(limit) ? limit : undefined,
    offset: Number.isFinite(offset) ? offset : undefined,
  })
  await touchApiToken(token)
  return result
})
