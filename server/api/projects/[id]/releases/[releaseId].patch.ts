import { numericID } from '#server/helper/id'
import { requireProjectOwner } from '#server/helper/access'
import { readZodBody } from '#server/helper/validate'
import { renameRelease, throwReleaseHttp } from '#server/helper/release'
import { zReleaseRename } from '#shared/utils/schemas'

/**
 * @route PATCH /api/projects/:id/releases/:releaseId
 * @description Rename a release label. Associations are untouched.
 */
export default defineEventHandler(async (event) => {
  const id = getRouterParam(event, 'id')
  const releaseIdParam = getRouterParam(event, 'releaseId')
  if (!id || !releaseIdParam) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Missing id',
    })
  }
  const projectId = numericID(id)
  const releaseId = numericID(releaseIdParam)
  await requireProjectOwner(event, projectId)
  const { name } = await readZodBody(event, zReleaseRename.parse)
  try {
    return await renameRelease({ projectId, releaseId, name })
  } catch (error) {
    throwReleaseHttp(error)
  }
})