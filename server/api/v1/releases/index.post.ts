import { authenticateWriteRequest, touchApiToken } from '#server/helper/api-token'
import { resolveTokenProject } from '#server/helper/api-token-project'
import { assertTokenManagesReleases } from '#server/helper/api-author'
import { createRelease, throwReleaseHttp } from '#server/helper/release'
import { readZodBody } from '#server/helper/validate'
import { zReleaseCreate } from '#shared/utils/schemas'

/**
 * @route POST /api/v1/releases
 * @description Define a release label. Project owner only — attaching a label
 * to a page or a key is a different route and does not need this.
 */
export default defineEventHandler(async (event) => {
  const token = await authenticateWriteRequest(
    getRequestHeader(event, 'authorization')
  )
  const projectId = await resolveTokenProject(token, getQuery(event).project)
  await assertTokenManagesReleases(token.createdBy, projectId)
  const { name } = await readZodBody(event, zReleaseCreate.parse)
  try {
    const release = await createRelease({ projectId, name })
    await touchApiToken(token)
    return release
  } catch (error) {
    throwReleaseHttp(error)
  }
})
