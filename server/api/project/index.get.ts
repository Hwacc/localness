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
        select: {
          id: true,
          name: true,
          image: true,
          settings: {
            omit: {
              id: true,
              pageID: true,
              createdAt: true,
              updatedAt: true,
            },
          },
        },
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
        },
      },
    },
    orderBy: {
      updatedAt: 'desc',
    },
  })
  return projects
})
