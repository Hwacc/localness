import prisma from '#server/libs/prisma'
import { numericID } from '#server/helper/id'
import { requireProjectRosterAccess } from '#server/helper/access'
import {
  REMOVE_PROJECT_OWNER_MESSAGES,
  isProjectSteward,
  ownerChangeStatus,
  removeProjectOwnerRejectReason,
} from '#server/helper/project-owner'

/**
 * @route DELETE /api/projects/:id/owners/:userId
 * @description Remove a Project Owner (current Project Owner or Admin; last owner stays)
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
  const { userId, isAdmin } = await requireProjectRosterAccess(
    event,
    projectId
  )

  const owners = await prisma.projectOwner.findMany({
    where: { projectId },
    select: { userId: true },
  })
  const ownerUserIds = owners.map((o) => o.userId)
  const actorCanAppoint =
    isAdmin || isProjectSteward({ userId, ownerUserIds })

  const reason = removeProjectOwnerRejectReason({
    actorCanAppoint,
    targetUserId,
    ownerUserIds,
  })
  if (reason) {
    throw createError({
      statusCode: ownerChangeStatus(reason),
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
