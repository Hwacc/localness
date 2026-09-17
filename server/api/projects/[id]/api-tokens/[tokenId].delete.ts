import prisma from '#server/libs/prisma'
import { numericID } from '#server/helper/id'
import { requireProjectAccess } from '#server/helper/access'
import { assertApiTokenRevocable } from '#server/helper/api-token'

/**
 * @route DELETE /api/projects/:id/api-tokens/:tokenId
 * @description Revoke a token. The row is kept so `lastUsedAt` survives for
 * audit. Revoking twice is a no-op.
 *
 * Any team member may revoke what they minted; a steward may revoke anyone's.
 * The ownership check runs before the already-revoked short-circuit, so probing
 * another member's token id cannot report back whether it exists.
 */
export default defineEventHandler(async (event) => {
  const id = getRouterParam(event, 'id')
  const tokenId = getRouterParam(event, 'tokenId')
  if (!id || !tokenId) {
    throw createError({ statusCode: 400, statusMessage: 'Missing id' })
  }
  const projectId = numericID(id)
  const nTokenId = numericID(tokenId)
  const access = await requireProjectAccess(event, projectId)

  const existing = await prisma.apiToken.findFirst({
    where: { id: nTokenId, projectId },
  })
  if (!existing) {
    throw createError({ statusCode: 404, statusMessage: 'Token not found' })
  }

  assertApiTokenRevocable(existing, access)

  if (existing.revokedAt) return { ok: true, alreadyRevoked: true }

  await prisma.apiToken.update({
    where: { id: nTokenId },
    data: { revokedAt: new Date() },
  })
  return { ok: true }
})
