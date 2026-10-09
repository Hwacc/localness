import { authenticateWriteRequest, touchApiToken } from '#server/helper/api-token'
import { resolveTokenProject } from '#server/helper/api-token-project'
import { setReleaseMembership, throwReleaseHttp } from '#server/helper/release'
import { readZodBody } from '#server/helper/validate'
import { zReleaseMembership } from '#shared/utils/schemas'

/**
 * @route POST /api/v1/release-membership
 * @description Add or remove one release label on pages or keys. Set semantics,
 * so repeating an add does not fail. Does not delete the page, the tag, or the
 * key — a label is not a copy of the content.
 */
export default defineEventHandler(async (event) => {
  const token = await authenticateWriteRequest(
    getRequestHeader(event, 'authorization')
  )
  const projectId = await resolveTokenProject(token, getQuery(event).project)
  const body = await readZodBody(event, zReleaseMembership.parse)
  try {
    const result = await setReleaseMembership({ projectId, ...body })
    await touchApiToken(token)
    return result
  } catch (error) {
    throwReleaseHttp(error)
  }
})
