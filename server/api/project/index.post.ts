import prisma from '~/libs/prisma'
import z from 'zod/v4'

const zProject = z.object({
  name: z.string().min(3),
  description: z.optional(z.string()),
})

/**
 * @route POST /api/project
 * @description Create a new project
 * @access Private
 */
export default defineEventHandler(async (event) => {
  const session = await requireUserSession(event)
  const { name, description } = await readValidatedBody(event, zProject.parse)

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
