import prisma from '#server/libs/prisma'
import { numericID } from '#server/helper/id'
import { requireTeamAccess } from '#server/helper/access'

/**
 * @route GET /api/teams/:id
 */
export default defineEventHandler(async (event) => {
  const id = getRouterParam(event, 'id')
  if (!id) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Missing team id',
    })
  }
  const teamId = numericID(id)
  const { userId } = await requireTeamAccess(event, teamId)
  const team = await prisma.team.findUnique({
    where: { id: teamId },
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
  })
  if (!team) {
    throw createError({
      statusCode: 404,
      statusMessage: 'Team not found',
    })
  }
  return {
    ...team,
    role: team.members.find((m) => m.userId === userId)?.role,
  }
})
