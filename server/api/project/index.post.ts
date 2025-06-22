import prisma from '~/lib/prisma'
import zod from 'zod'

const zProject = zod.object({
  name: zod.string().min(3),
  description: zod.optional(zod.string()),
})

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
  })
  return project
})
