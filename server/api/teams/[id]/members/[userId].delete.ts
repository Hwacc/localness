import prisma from '#server/libs/prisma'
import { numericID } from '#server/helper/id'
import { requireTeamOwner } from '#server/helper/access'
import { TeamRole } from '#shared/constants'

/**
 * @route DELETE /api/teams/:id/members/:userId
 */
export default defineEventHandler(async (event) => {
  const id = getRouterParam(event, 'id')
  const userIdParam = getRouterParam(event, 'userId')
  if (!id || !userIdParam) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Missing id',
    })
  }
  const teamId = numericID(id)
  const targetUserId = numericID(userIdParam)
  await requireTeamOwner(event, teamId)

  const membership = await prisma.userTeam.findUnique({
    where: {
      userId_teamId: { userId: targetUserId, teamId },
    },
  })
  if (!membership) {
    throw createError({
      statusCode: 404,
      statusMessage: 'Member not found',
    })
  }

  if (membership.role === TeamRole.OWNER) {
    const ownerCount = await prisma.userTeam.count({
      where: { teamId, role: TeamRole.OWNER },
    })
    if (ownerCount <= 1) {
      throw createError({
        statusCode: 400,
        statusMessage: 'Cannot remove the last OWNER',
      })
    }
  }

  await prisma.userTeam.delete({
    where: {
      userId_teamId: { userId: targetUserId, teamId },
    },
  })
  return { ok: true }
})
