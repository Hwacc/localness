import prisma from "~/libs/prisma"

/**
 * @route DELETE /api/page/:id
 * @description Delete a page
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
  const page = await prisma.page.delete({
    where: {
      id: numericID,
    },
    include: {
      tags: true,
    },
  })
  return page
})