import prisma from '~/libs/prisma'
import zod from 'zod'

const zProject = zod.object({
  name: zod.string().min(3),
  description: zod.optional(zod.string()),
})
/**
 * @route POST /api/project/:id
 * @description Update a project
 * @access Private
 */
export default defineEventHandler(async (event) => {
  const session = await requireUserSession(event)

  const id = getRouterParam(event, 'id')
  if (!id) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Missing id',
    })
  }
  const numericID = parseInt(id, 10)
  if (isNaN(numericID)) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Invalid id format',
    })
  }

  const { name, description } = await readValidatedBody(event, zProject.parse)
  if (!name) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Missing name',
    })
  }
  const findProject = await prisma.project.findUnique({
    where: {
      id: numericID,
    },
  })

  if (!findProject || session.user.id !== findProject.ownerID) {
    throw createError({
      statusCode: 403,
      statusMessage: 'Forbidden',
    })
  }

  const updatedProject = await prisma.project.update({
    where: {
      id: numericID,
    },
    data: {
      name,
      description,
    },
    select: {
      id: true,
      name: true,
      description: true,
      updatedAt: true,
    },
  })

  return updatedProject
})
