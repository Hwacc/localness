import prisma from '#server/libs/prisma'
import { numericID } from '#server/helper/id'
import { requireProjectOwner } from '#server/helper/access'

/**
 * @route DELETE /api/projects/:id/api-tokens/:tokenId
 * @description Revoke a token. The row is kept so `lastUsedAt` survives for
 * audit. Revoking twice is a no-op.
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
  if (existing.revokedAt) return { ok: true, alreadyRevoked: true }

  await prisma.apiToken.update({
    where: { id: nTokenId },
    data: { revokedAt: new Date() },
  })
  return { ok: true }
})