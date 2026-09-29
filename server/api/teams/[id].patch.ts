import prisma from '#server/libs/prisma'
import { numericID } from '#server/helper/id'
import { requireTeamOwner } from '#server/helper/access'
import { readZodBody } from '#server/helper/validate'
import { z } from 'zod/v4'

const zTeamRename = z.object({
  name: z.string().trim().min(2).max(60),
})

/**
 * @route PATCH /api/teams/:id
 * @description Rename a team (Team Owner).
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
  const { name } = await readZodBody(event, zTeamRename.parse)

  return prisma.team.update({
    where: { id: teamId },
    data: { name },
    select: { id: true, name: true, updatedAt: true },
  })
})
