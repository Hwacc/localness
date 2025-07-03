import prisma from '~/server/libs/prisma'
import { numericID } from '~/utils/id'

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
  const nID = numericID(id)
  const deletedTag = await prisma.tag.delete({
    where: {
      id: nID,
    },
  })
  return deletedTag
})
