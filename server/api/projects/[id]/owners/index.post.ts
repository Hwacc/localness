import { z } from 'zod/v4'
import prisma from '#server/libs/prisma'
import { numericID } from '#server/helper/id'
import { readZodBody } from '#server/helper/validate'
import { requireProjectRosterAccess } from '#server/helper/access'
import {
  ADD_PROJECT_OWNER_MESSAGES,
  addProjectOwnerRejectReason,
  isProjectSteward,
  ownerChangeStatus,
} from '#server/helper/project-owner'

const zAdd = z.object({
  userId: z.number().int().positive(),
})

/**
 * @route POST /api/projects/:id/owners
 * @description Add a Project Owner (current Project Owner or Admin)
 */
export default defineEventHandler(async (event) => {
  const id = getRouterParam(event, 'id')
  if (!id) {
    throw createError({ statusCode: 400, statusMessage: 'Missing project id' })
  }
  const projectId = numericID(id)
  const { userId, isAdmin, project } = await requireProjectRosterAccess(
    event,
    projectId
  )
  const { userId: targetUserId } = await readZodBody(event, zAdd.parse)

  const members = await prisma.userTeam.findMany({
    where: { teamId: project.teamId },
    select: { userId: true },
  })
  const owners = await prisma.projectOwner.findMany({
    where: { projectId },
    select: { userId: true },
  })
  const ownerUserIds = owners.map((o) => o.userId)
  const actorCanAppoint =
    isAdmin || isProjectSteward({ userId, ownerUserIds })

  const reason = addProjectOwnerRejectReason({
    actorCanAppoint,
    targetUserId,
    teamMemberIds: members.map((m) => m.userId),
    ownerUserIds,
  })
  if (reason) {
    throw createError({
      statusCode: ownerChangeStatus(reason),
      statusMessage: ADD_PROJECT_OWNER_MESSAGES[reason],
    })
  }

  await prisma.projectOwner.create({
    data: { userId: targetUserId, projectId },
  })
  return { ok: true, userId: targetUserId }
})
