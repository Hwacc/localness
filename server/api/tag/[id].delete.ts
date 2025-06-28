import prisma from '~/server/libs/prisma'


/**
 * @route DELETE /api/tag/:id
 * @description Delete a tag
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
  const deletedTag = await prisma.tag.delete({
    where: {
      id: numericID,
    },
  })
  return deletedTag
})
