import prisma from '#server/libs/prisma'
import { numericID } from '#server/helper/id'

/**
 * @route GET /api/project/:id
 * @description Get a project
 * @access Private
 */
export default defineEventHandler(async (event) => {
  await requireUserSession(event)
  const id = getRouterParam(event, 'id')
  if (!id) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Missing id',
    })
  }
  const nID = numericID(id)
  const project = await prisma.project.findUnique({
    where: {
      id: nID,
    },
    include: {
      pages: {
        orderBy: {
          updatedAt: 'desc',
        },
      },
      users: true,
      settings: {
        omit: {
          id: true,
          projectID: true,
          createdAt: true,
          updatedAt: true,
        }
      },
    },
  })
  return project
})
