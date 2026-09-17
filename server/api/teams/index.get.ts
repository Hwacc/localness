import prisma from '#server/libs/prisma'
import { numericID } from '#server/helper/id'

/**
 * @route GET /api/teams
 * @description List teams the user belongs to
 */
export default defineEventHandler(async (event) => {
  const session = await requireUserSession(event)
  const userId = numericID(session.user.id)
  const teams = await prisma.team.findMany({
    where: {
      members: { some: { userId } },
    },
    include: {
      members: {
        include: {
          user: {
            omit: {
              password: true,
              createdAt: true,
              updatedAt: true,
            },
          },
        },
      },
      _count: { select: { projects: true } },
    },
    orderBy: { createdAt: 'desc' },
  })
  return teams.map((team) => ({
    ...team,
    role: team.members.find((m) => m.userId === userId)?.role,
  }))
})
