import prisma from '~/lib/prisma'

export default defineEventHandler(async (event) => {
  const id = getRouterParam(event, 'id')
  if (!id) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Missing id',
    })
  }

  const numericId = parseInt(id, 10)
  if (isNaN(numericId)) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Invalid id format',
    })
  }

  const project = await prisma.project.findUnique({
    where: {
      id: numericId,
    },
  })

  return project
})
