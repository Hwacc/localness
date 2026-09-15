import { numericID } from '#server/helper/id'
import { requireProjectOwner } from '#server/helper/access'
import { deleteRelease, throwReleaseHttp } from '#server/helper/release'

/**
 * @route DELETE /api/projects/:id/releases/:releaseId
 * @description Drop a release label and its associations.
 *
 * Pages and translations are never deleted — they simply stop being reachable by
 * this label and fall back to Unassigned. The confirm copy in the UI says so.
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
  try {
    return await deleteRelease({ projectId, releaseId })
  } catch (error) {
    throwReleaseHttp(error)
  }
})