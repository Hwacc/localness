import prisma from '#server/libs/prisma'
import { numericID } from '#server/helper/id'
import { projectDetailInclude, shapeProject } from '#server/helper/i18n'

/**
 * @route GET /api/project
 * @description Get team-visible projects
 * @access Private
 */
export default defineEventHandler(async (event) => {
  const session = await requireUserSession(event)
  const userId = numericID(session.user.id)
  const memberships = await prisma.userTeam.findMany({
    where: { userId },
    select: { teamId: true },
  })
  const teamIds = memberships.map((m) => m.teamId)
  const projects = await prisma.project.findMany({
    where: {
      teamId: { in: teamIds },
    },
    include: projectDetailInclude,
    orderBy: {
      updatedAt: 'desc',
    },
  })
  return projects.map((p) => shapeProject(p))
})
