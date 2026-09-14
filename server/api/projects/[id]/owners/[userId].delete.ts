import prisma from '#server/libs/prisma'
import { numericID } from '#server/helper/id'
import { requireTeamMember } from '#server/helper/access'
import { TeamRole } from '#shared/constants'
import {
  REMOVE_PROJECT_OWNER_MESSAGES,
  removeProjectOwnerRejectReason,
} from '#server/helper/project-owner'

/**
 * @route DELETE /api/projects/:id/owners/:userId
 * @description Remove a Project Owner (Team OWNER only; not implicit Team OWNER)
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
  const projectId = numericID(id)
  const targetUserId = numericID(userIdParam)
  const { membership, project } = await requireTeamMember(event, projectId)

  const members = await prisma.userTeam.findMany({
    where: { teamId: project.teamId },
    select: { userId: true, role: true },
  })
  const owners = await prisma.projectOwner.findMany({
    where: { projectId },
    select: { userId: true },
  })
  const teamRoleByUserId: Record<number, string> = {}
  for (const row of members) teamRoleByUserId[row.userId] = row.role

  const reason = removeProjectOwnerRejectReason({
    actorIsTeamOwner: membership.role === TeamRole.OWNER,
    targetUserId,
    teamRoleByUserId,
    ownerUserIds: owners.map((o) => o.userId),
  })
  if (reason) {
    throw createError({
      statusCode: reason === 'not-team-owner' ? 403 : 400,
      statusMessage: REMOVE_PROJECT_OWNER_MESSAGES[reason],
    })
  }

  await prisma.projectOwner.delete({
    where: {
      userId_projectId: { userId: targetUserId, projectId },
    },
  })
  return { ok: true }
})
