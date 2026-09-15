import prisma from '#server/libs/prisma'
import { numericID } from '#server/helper/id'
import { requireProjectRosterAccess } from '#server/helper/access'
import { isProjectSteward } from '#server/helper/project-owner'

/**
 * @route GET /api/projects/:id/owners
 * @description List Project Owners (Project Owner or Admin)
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
  const ownerRows = await prisma.projectOwner.findMany({
    where: { projectId },
    include: {
      user: { select: { id: true, username: true, nickname: true } },
    },
  })
  const ownerUserIds = ownerRows.map((row) => row.userId)
  const canAppoint =
    isAdmin || isProjectSteward({ userId, ownerUserIds })
  if (!canAppoint) {
    throw createError({ statusCode: 403, statusMessage: 'Forbidden' })
  }

  const members = await prisma.userTeam.findMany({
    where: { teamId: project.teamId },
    include: {
      user: { select: { id: true, username: true, nickname: true } },
    },
  })

  const listedIds = new Set(ownerUserIds)
  const owners = ownerRows.map((row) => ({
    userId: row.userId,
    username: row.user.username,
    nickname: row.user.nickname,
  }))
  const candidates = members
    .filter((row) => !listedIds.has(row.userId))
    .map((row) => ({
      userId: row.userId,
      username: row.user.username,
      nickname: row.user.nickname,
    }))

  return {
    canAppoint,
    owners,
    candidates,
  }
})
