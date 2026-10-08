import { authenticateWriteRequest, touchApiToken } from '#server/helper/api-token'
import { resolveTokenProject } from '#server/helper/api-token-project'
import { readZodBody } from '#server/helper/validate'
import { createPageWithTags } from '#server/helper/api-write'
import type { CreatePageResult } from '#shared/types/Import'

/**
 * @route POST /api/v1/pages
 * @description Import a design frame as a page, with one tag per text layer.
 *
 * This is the only import route that has to name a project: it creates one,
 * where the others derive it from the page they address. It is `?project=` rather
 * than a body field so there is one rule for the whole API — *when the
 * credential cannot decide, the project is a query parameter* — which is also
 * how `/mcp` addresses it.
 *
 * A single-project token still posts here with no parameter, so the plugin is
 * unaffected.
 *
 * `image` is the key returned by `POST /api/v1/uploads`.
 */
export default defineEventHandler(async (event): Promise<CreatePageResult> => {
  const token = await authenticateWriteRequest(
    getRequestHeader(event, 'authorization')
  )
  const projectId = await resolveTokenProject(token, getQuery(event).project)
  const body = await readZodBody(event, zApiV1PageCreate.parse)
  const result = await createPageWithTags({ projectId, ...body })
  await touchApiToken(token)
  return result
})