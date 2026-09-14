import prisma from '#server/libs/prisma'
import { numericID } from '#server/helper/id'
import { requireTeamOwner } from '#server/helper/access'
import {
  TEAM_DELETE_MESSAGES,
  teamDeleteRejectReason,
} from '#server/helper/team-membership'
import { payloadTeamId } from '#server/helper/notifications'
import { NotificationAction, NotificationType } from '#shared/constants'

/**
 * @route DELETE /api/teams/:id
 * @description Delete an empty team (team OWNER).
 *
 * The escape hatch for a sole OWNER: they cannot leave (that would leave the
 * team with no OWNER) and have nobody to promote first. Narrow by design — only
 * the last remaining member, and only with no projects, so this can never take
 * translation data with it.
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
  const { userId } = await requireTeamOwner(event, teamId)

  const [members, projectCount] = await Promise.all([
    prisma.userTeam.findMany({
      where: { teamId },
      select: { userId: true, role: true },
    }),
    prisma.project.count({ where: { teamId } }),
  ])
  const reason = teamDeleteRejectReason(members, projectCount, userId)
  if (reason) {
    throw createError({
      statusCode: reason === 'not-member' ? 404 : 400,
      statusMessage: TEAM_DELETE_MESSAGES[reason],
    })
  }

  // `UserTeam` and `TeamInviteCode` both declare ON DELETE CASCADE on the Team
  // relation, so they go with it. Pending TEAM_INVITE notifications do not:
  // their teamId lives in the `payload` JSON with no foreign key, and accepting
  // one after the team is gone fails on the membership insert. Drop them in the
  // same transaction.
  await prisma.$transaction(async (tx) => {
    const pending = await tx.notification.findMany({
      where: {
        type: NotificationType.TEAM_INVITE,
        action: NotificationAction.PENDING,
      },
      select: { id: true, payload: true },
    })
    const stale = pending
      .filter((row) => payloadTeamId(row.payload) === teamId)
      .map((row) => row.id)
    if (stale.length) {
      await tx.notification.deleteMany({ where: { id: { in: stale } } })
    }
    await tx.team.delete({ where: { id: teamId } })
  })
  return { ok: true }
})
