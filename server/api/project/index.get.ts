import prisma from '~/lib/prisma'

export default defineEventHandler(async (event) => {
  await requireUserSession(event)
  try {
    const projects = await prisma.project.findMany({
      include: {
        pages: true,
        users: true,
      },
      orderBy: {
        updatedAt: 'desc',
      },
    })
    console.log('projects', projects)
    return projects
  } catch (error) {
    throw createError({
      statusCode: 500,
      statusMessage: 'Internal Server Error',
      cause: error,
    })
  }
})
