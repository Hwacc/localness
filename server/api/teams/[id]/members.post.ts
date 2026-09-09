import prisma from '#server/libs/prisma'
import { numericID } from '#server/helper/id'
import { readZodBody } from '#server/helper/validate'
import { requireTeamOwner } from '#server/helper/access'
import { TeamRole, UserRole } from '#shared/constants'
import { z } from 'zod/v4'

const zInvite = z.object({
  username: z.string().min(1),
  role: z.enum([TeamRole.OWNER, TeamRole.MEMBER]).optional(),
})

/**
 * @route POST /api/teams/:id/members
 * @description Invite an existing user into the team (OWNER)
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
  await requireTeamOwner(event, teamId)
  const { username, role } = await readZodBody(event, zInvite.parse)
  const invitee = await prisma.user.findUnique({
    where: { username },
  })
  if (!invitee) {
    throw createError({
      statusCode: 404,
      statusMessage: 'User not found',
    })
  }
  if (invitee.role === UserRole.GUEST) {
    throw createError({
      statusCode: 400,
      statusMessage: 'GUEST cannot join a team',
    })
  }
  const member = await prisma.userTeam.upsert({
    where: {
      userId_teamId: { userId: invitee.id, teamId },
    },
    create: {
      userId: invitee.id,
      teamId,
      role: role ?? TeamRole.MEMBER,
    },
    update: {
      role: role ?? TeamRole.MEMBER,
    },
    include: {
      user: {
        omit: {
          password: true,
          createdAt: true,
          updatedAt: true,
        },
      },
    },
  })
  return member
})
