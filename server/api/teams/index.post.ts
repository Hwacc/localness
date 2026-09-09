import prisma from '#server/libs/prisma'
import { readZodBody } from '#server/helper/validate'
import { requirePlatformAdmin } from '#server/helper/access'
import { TeamRole } from '#shared/constants'
import { z } from 'zod/v4'

const zTeamCreate = z.object({
  name: z.string().min(2),
})

/**
 * @route POST /api/teams
 * @description Create a team (platform ADMIN). Creator becomes OWNER.
 */
export default defineEventHandler(async (event) => {
  const { user } = await requirePlatformAdmin(event)
  const { name } = await readZodBody(event, zTeamCreate.parse)
  const team = await prisma.team.create({
    data: {
      name,
      members: {
        create: {
          userId: user.id,
          role: TeamRole.OWNER,
        },
      },
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
    },
  })
  return team
})
