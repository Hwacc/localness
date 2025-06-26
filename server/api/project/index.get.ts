import prisma from '~/server/libs/prisma'

/**
 * @route GET /api/project
 * @description Get all projects
 * @access Private
 */
export default defineEventHandler(async (event) => {
  await requireUserSession(event)
  const projects = await prisma.project.findMany({
    include: {
      pages: {
        orderBy: {
          updatedAt: 'desc',
        }
      },
      users: true,
    },
    orderBy: {
      updatedAt: 'desc',
    },
  })
  return projects
})
