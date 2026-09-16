import prisma from '#server/libs/prisma'
import { numericID } from '#server/helper/id'
import { requireProjectOwner } from '#server/helper/access'
import { assertApiTokenPurgeable, throwPublicError } from '#server/helper/api-token'

/**
 * @route DELETE /api/projects/:id/api-tokens/:tokenId/purge
 * @description Hard-delete a revoked token. Its own path rather than a flag on
 * the revoke route, so "stop this token" and "erase this record" can never be
 * confused for one another. A live token is refused — revoking first is what
 * leaves the trail explaining why the consumer stopped working.
 */
export default defineEventHandler(async (event) => {
  const id = getRouterParam(event, 'id')
  const tokenId = getRouterParam(event, 'tokenId')
  if (!id || !tokenId) {
    throw createError({ statusCode: 400, statusMessage: 'Missing id' })
  }
  const projectId = numericID(id)
  const nTokenId = numericID(tokenId)
  await requireProjectOwner(event, projectId)

  const existing = await prisma.apiToken.findFirst({
    where: { id: nTokenId, projectId },
  })
  if (!existing) {
    throw createError({ statusCode: 404, statusMessage: 'Token not found' })
  }

  try {
    assertApiTokenPurgeable(existing)
  } catch (error) {
    throwPublicError(error)
  }

  await prisma.apiToken.delete({ where: { id: nTokenId } })
  return { ok: true }
})