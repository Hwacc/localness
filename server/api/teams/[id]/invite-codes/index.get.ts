import prisma from '#server/libs/prisma'
import { numericID } from '#server/helper/id'
import { requireTeamOwner } from '#server/helper/access'
import { shapeInviteCode } from '#server/helper/team-invite'

/**
 * @route GET /api/teams/:id/invite-codes
 * @description List unrevoked invite codes (OWNER)
 */
export default defineEventHandler(async (event) => {
  const id = getRouterParam(event, 'id')
  if (!id) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Missing team id',
    })
  }
  const teamId = numericID(id)
  await requireTeamOwner(event, teamId)
  const rows = await prisma.teamInviteCode.findMany({
    where: { teamId, revokedAt: null },
    orderBy: { createdAt: 'desc' },
  })
  return rows.map(shapeInviteCode)
})
