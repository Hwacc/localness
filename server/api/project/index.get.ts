import prisma from '#server/libs/prisma'
import { numericID } from '#server/helper/id'
import { projectDetailInclude, shapeProject } from '#server/helper/i18n'
import { UserRole } from '#shared/constants'

/**
 * @route GET /api/project
 * @description Get team-visible projects (Admin sees all)
 * @access Private
 */
export default defineEventHandler(async (event) => {
  const session = await requireUserSession(event)
  const userId = numericID(session.user.id)
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { role: true },
  })
  const memberships = await prisma.userTeam.findMany({
    where: { userId },
    select: { teamId: true },
  })
  const teamIds = memberships.map((m) => m.teamId)
  const projects = await prisma.project.findMany({
    where:
      user?.role === UserRole.ADMIN
        ? undefined
        : {
            teamId: { in: teamIds },
          },
    include: projectDetailInclude,
    orderBy: {
      updatedAt: 'desc',
    },
  })
  return projects.map((p) => shapeProject(p, userId))
})
