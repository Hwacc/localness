import prisma from '#server/libs/prisma'
import { numericID } from '#server/helper/id'
import { requireSessionActor } from '#server/helper/access'
import {
  assertApiTokenPurgeable,
  assertApiTokenRevocable,
} from '#server/helper/api-token'

/**
 * @route DELETE /api/user/api-tokens/:tokenId/purge
 * @description Erase a revoked token for good.
 *
 * Separate from revoke because it destroys the record rather than stopping the
 * credential: revoking first is what leaves behind the answer to "why did this
 * stop working". `assertApiTokenPurgeable` refuses anything still live.
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
  assertApiTokenPurgeable(existing)

  await prisma.apiToken.delete({ where: { id: tokenId } })
  return { ok: true }
})