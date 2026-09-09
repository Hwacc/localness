import prisma from '#server/libs/prisma'
import { numericID } from '#server/helper/id'
import { UserRole } from '#shared/constants'

/**
 * @route GET /api/teams
 * @description List teams the user belongs to (ADMIN sees all)
 */
export default defineEventHandler(async (event) => {
  const session = await requireUserSession(event)
  const userId = numericID(session.user.id)
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { role: true },
  })
  const teams = await prisma.team.findMany({
    where:
      user?.role === UserRole.ADMIN
        ? undefined
        : {
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
