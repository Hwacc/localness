import prisma from '#server/libs/prisma'
import { numericID } from '#server/helper/id'
import { requireSessionActor } from '#server/helper/access'
import { assertApiTokenRevocable } from '#server/helper/api-token'

/**
 * @route DELETE /api/user/api-tokens/:tokenId
 * @description Revoke one of your own tokens. Soft: the row stays, stamped, so
 * `lastUsedAt` and the creation date survive as the audit trail.
 *
 * The ownership check runs *before* the already-revoked short-circuit. Both
 * would end in the same state, but checking first means someone else's token id
 * cannot be probed for existence.
 */
export default defineEventHandler(async (event) => {
  const { userId, isAdmin } = await requireSessionActor(event)
  const id = getRouterParam(event, 'tokenId')
  if (!id) {
    throw createError({ statusCode: 400, statusMessage: 'Missing token id' })
  }
  const tokenId = numericID(id)

  const existing = await prisma.apiToken.findUnique({
    where: { id: tokenId },
    select: { id: true, createdBy: true, revokedAt: true },
  })
  if (!existing) {
    throw createError({ statusCode: 404, statusMessage: 'Token not found' })
  }
  assertApiTokenRevocable(existing, { userId, isAdmin })
  if (existing.revokedAt) return { ok: true, alreadyRevoked: true }

  await prisma.apiToken.update({
    where: { id: tokenId },
    data: { revokedAt: new Date() },
  })
  return { ok: true }
})