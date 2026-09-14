import prisma from '#server/libs/prisma'
import { numericID } from '#server/helper/id'
import { requireTeamOwner } from '#server/helper/access'
import {
  MEMBER_REMOVAL_MESSAGES,
  memberRemovalRejectReason,
} from '#server/helper/team-membership'

/**
 * @route DELETE /api/teams/:id/members/:userId
 * @description Remove a member (team OWNER), or leave the team (self).
 *
 * One route for both so the "a team must keep at least one OWNER" guard cannot
 * drift between kick and leave. Without the self case a plain MEMBER had no way
 * out of a team at all.
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

  const session = await requireUserSession(event)
  const actorUserId = numericID(session.user.id)
  // Leaving needs no role; removing somebody else does.
  if (actorUserId !== targetUserId) {
    await requireTeamOwner(event, teamId)
  }

  const members = await prisma.userTeam.findMany({
    where: { teamId },
    select: { userId: true, role: true },
  })
  // A self-request from a non-member is the same 404 as any missing membership,
  // so leaving a team you are not on does not read as success.
  const reason = memberRemovalRejectReason(members, targetUserId)
  if (reason) {
    throw createError({
      statusCode: reason === 'not-member' ? 404 : 400,
      statusMessage: MEMBER_REMOVAL_MESSAGES[reason],
    })
  }

  await prisma.$transaction([
    prisma.projectOwner.deleteMany({
      where: {
        userId: targetUserId,
        project: { teamId },
      },
    }),
    prisma.userTeam.delete({
      where: {
        userId_teamId: { userId: targetUserId, teamId },
      },
    }),
  ])
  return { ok: true }
})
