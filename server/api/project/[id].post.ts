import prisma from '~/server/libs/prisma'
import { z } from 'zod/v4'
import { numericID } from '~/utils/id'

const zProject = z.object({
  name: z.string().min(3),
  description: z.optional(z.string()),
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
  const nID = numericID(id)
  if (isNaN(nID)) {
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
      id: nID,
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
      id: nID,
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
