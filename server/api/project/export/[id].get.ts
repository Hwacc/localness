import prisma from '~/server/libs/prisma'
import { numericID } from '~/utils/id'

/**
 * @route GET /api/project/export/:id
 * @description Export a project
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
        include: {
          tags: {
            include: {
              translation: {
                select: {
                  vue: true,
                  react: true,
                },
              },
            },
          },
        },
      },
    },
  })
  return project
})
