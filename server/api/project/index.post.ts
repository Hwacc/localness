import prisma from '~/libs/prisma'
import zod from 'zod'

const zProject = zod.object({
  name: zod.string().min(3),
  description: zod.optional(zod.string()),
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
