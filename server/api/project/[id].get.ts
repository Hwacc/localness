import prisma from '~/libs/prisma'

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

  const numericID = parseInt(id, 10)
  if (isNaN(numericID)) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Invalid id format',
    })
  }

  const project = await prisma.project.findUnique({
    where: {
      id: numericID,
    },
  })

  return project
})
