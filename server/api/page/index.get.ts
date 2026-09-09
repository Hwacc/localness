import prisma from '#server/libs/prisma'
import { numericID } from '#server/helper/id'

/**
 * @route GET /api/page
 * @description Get pages in the current user's teams
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
  const pages = await prisma.page.findMany({
    where: {
      project: {
        teamId: { in: teamIds },
      },
    },
    include: {
      tags: true,
    },
    orderBy: {
      updatedAt: 'desc',
    },
  })
  return pages
})
