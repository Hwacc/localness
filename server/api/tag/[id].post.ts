import prisma from '~/server/libs/prisma'
import { zTag } from '~/constants/schemas'
import { numericID } from '~/utils/id'

/**
 * @route POST /api/tag/:id
 * @description Update a tag
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
  if (isNaN(nID)) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Invalid id format',
    })
  }
  const body = await readValidatedBody(event, zTag.parse)
  const updatedTag = await prisma.tag.update({
    where: {
      id: nID,
    },
    data: body as any,
    include: {
      translation: true,
    },
  })
  return updatedTag
})
