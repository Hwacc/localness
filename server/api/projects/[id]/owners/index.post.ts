import { z } from 'zod/v4'
import prisma from '#server/libs/prisma'
import { numericID } from '#server/helper/id'
import { readZodBody } from '#server/helper/validate'
import { requireTeamMember } from '#server/helper/access'
import { TeamRole } from '#shared/constants'
import {
  ADD_PROJECT_OWNER_MESSAGES,
  addProjectOwnerRejectReason,
} from '#server/helper/project-owner'

const zAdd = z.object({
  userId: z.number().int().positive(),
})

/**
 * @route POST /api/projects/:id/owners
 * @description Add a Project Owner (Team OWNER only)
 */
export default defineEventHandler(async (event) => {
  const id = getRouterParam(event, 'id')
  if (!id) {
    throw createError({ statusCode: 400, statusMessage: 'Missing project id' })
  }
  const projectId = numericID(id)
  const { membership, project } = await requireTeamMember(event, projectId)
  const { userId: targetUserId } = await readZodBody(event, zAdd.parse)

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

  const reason = addProjectOwnerRejectReason({
    actorIsTeamOwner: membership.role === TeamRole.OWNER,
    targetUserId,
    teamMemberIds: members.map((m) => m.userId),
    teamRoleByUserId,
    ownerUserIds: owners.map((o) => o.userId),
  })
  if (reason) {
    throw createError({
      statusCode: reason === 'not-team-owner' ? 403 : 400,
      statusMessage: ADD_PROJECT_OWNER_MESSAGES[reason],
    })
  }

  await prisma.projectOwner.create({
    data: { userId: targetUserId, projectId },
  })
  return { ok: true, userId: targetUserId }
})
