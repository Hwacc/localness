import prisma from '#server/libs/prisma'
import { numericID } from '#server/helper/id'
import { requireTeamOwner } from '#server/helper/access'
import { shapeInviteCode } from '#server/helper/team-invite'

/**
 * @route DELETE /api/teams/:id/invite-codes/:codeId
 * @description Soft-revoke an invite code (OWNER)
 */
export default defineEventHandler(async (event) => {
  const id = getRouterParam(event, 'id')
  const codeIdRaw = getRouterParam(event, 'codeId')
  if (!id || !codeIdRaw) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Missing team id or code id',
    })
  }
  const teamId = numericID(id)
  const codeId = numericID(codeIdRaw)
  await requireTeamOwner(event, teamId)

  const row = await prisma.teamInviteCode.findFirst({
    where: { id: codeId, teamId },
  })
  if (!row) {
    throw createError({
      statusCode: 404,
      statusMessage: 'Invite code not found',
    })
  }
  if (row.revokedAt) {
    return shapeInviteCode(row)
  }
  const updated = await prisma.teamInviteCode.update({
    where: { id: codeId },
    data: { revokedAt: new Date() },
  })
  return shapeInviteCode(updated)
})
