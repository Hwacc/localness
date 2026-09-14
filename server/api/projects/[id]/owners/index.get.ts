import prisma from '#server/libs/prisma'
import { numericID } from '#server/helper/id'
import { requireTeamMember } from '#server/helper/access'
import { isImplicitProjectSteward, isProjectSteward } from '#server/helper/project-owner'
import { TeamRole } from '#shared/constants'

/**
 * @route GET /api/projects/:id/owners
 * @description List Project Owners (steward or Team OWNER)
 */
export default defineEventHandler(async (event) => {
  const id = getRouterParam(event, 'id')
  if (!id) {
    throw createError({ statusCode: 400, statusMessage: 'Missing project id' })
  }
  const projectId = numericID(id)
  const { membership, userId, project } = await requireTeamMember(
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
  const viewerIsSteward = isProjectSteward({
    userId,
    teamRole: membership.role,
    ownerUserIds,
  })
  if (!viewerIsSteward) {
    throw createError({ statusCode: 403, statusMessage: 'Forbidden' })
  }

  const members = await prisma.userTeam.findMany({
    where: { teamId: project.teamId },
    include: {
      user: { select: { id: true, username: true, nickname: true } },
    },
  })

  const listed = new Map<
    number,
    {
      userId: number
      username: string
      nickname: string | null
      implicit: boolean
    }
  >()
  for (const row of members) {
    if (!isImplicitProjectSteward(row.role)) continue
    listed.set(row.userId, {
      userId: row.userId,
      username: row.user.username,
      nickname: row.user.nickname,
      implicit: true,
    })
  }
  for (const row of ownerRows) {
    if (listed.has(row.userId)) continue
    listed.set(row.userId, {
      userId: row.userId,
      username: row.user.username,
      nickname: row.user.nickname,
      implicit: false,
    })
  }

  const candidates = members
    .filter((row) => !listed.has(row.userId))
    .map((row) => ({
      userId: row.userId,
      username: row.user.username,
      nickname: row.user.nickname,
    }))

  return {
    canAppoint: membership.role === TeamRole.OWNER,
    owners: [...listed.values()],
    candidates,
  }
})
