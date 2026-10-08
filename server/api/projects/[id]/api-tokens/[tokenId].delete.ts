import prisma from '#server/libs/prisma'
import { numericID } from '#server/helper/id'
import { requireProjectAccess } from '#server/helper/access'
import { assertProjectDetachable } from '#server/helper/api-token'

/**
 * @route DELETE /api/projects/:id/api-tokens/:tokenId
 * @description Cut *this project* out of a token's reach.
 *
 * Not a revocation — the token keeps working everywhere else, and only its owner
 * (or a platform admin) can stop it outright. This is the steward's lever, and
 * it is deliberately the narrowest one that answers the case it exists for: a
 * credential that can reach your project and whose owner will not revoke it, when
 * removing the person from the team would be a much bigger act than the occasion
 * calls for.
 *
 * Scoping it to this project is the point. A steward who could revoke the token
 * outright would be cutting off projects they hold no authority over.
 */
export default defineEventHandler(async (event) => {
  const id = getRouterParam(event, 'id')
  const rawTokenId = getRouterParam(event, 'tokenId')
  if (!id || !rawTokenId) {
    throw createError({ statusCode: 400, statusMessage: 'Missing id' })
  }
  const projectId = numericID(id)
  const tokenId = numericID(rawTokenId)
  const access = await requireProjectAccess(event, projectId)

  const link = await prisma.apiTokenProject.findUnique({
    where: { tokenId_projectId: { tokenId, projectId } },
    select: { token: { select: { createdBy: true } } },
  })
  if (!link) {
    throw createError({ statusCode: 404, statusMessage: 'Token not found' })
  }
  assertProjectDetachable(link.token, {
    userId: access.userId,
    isSteward: access.isSteward,
  })

  await prisma.apiTokenProject.delete({
    where: { tokenId_projectId: { tokenId, projectId } },
  })
  return { ok: true }
})