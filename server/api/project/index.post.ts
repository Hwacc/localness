import prisma from '~/server/libs/prisma'
import z from 'zod/v4'
import { readZodBody } from '~/utils/validate'

const zProject = z.object({
  name: z.string().min(3),
  description: z.optional(z.string()),
}, 'Project parameters validate failed')

/**
 * @route POST /api/project
 * @description Create a new project
 * @access Private
 */
export default defineEventHandler(async (event) => {
  const session = await requireUserSession(event)
  const { name, description } = await readZodBody(event, zProject.parse)

  const project = await prisma.project.create({
    data: {
      name,
      description,
      ownerID: session.user.id as number,
      ownerUsername: session.user.username,
    },
    include: {
      users: true,
      pages: true,
    },
  })
  return project
})
