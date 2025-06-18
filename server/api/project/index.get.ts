import prisma from '~/lib/prisma'

export default defineEventHandler(async () => {
  try {
    const projects = await prisma.project.findMany({
      include: {
        pages: true,
      },
      orderBy: {
        updateAt: 'desc',
      },
    })
    return projects
  } catch (error) {
    throw createError({
      statusCode: 500,
      statusMessage: 'Internal Server Error',
      cause: error,
    })
  }
})
