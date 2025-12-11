import prisma from '#server/libs/prisma'
import { numericID } from '#server/helper/id'

/**
 * @route GET /api/tag/:id
 * @description Get a tag
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
  const tag = await prisma.tag.findUnique({
    where: {
      id: nID,
    },
    include: {
      settings: {
        omit: {
          id: true,
          tagID: true,
          createdAt: true,
          updatedAt: true,
        },
      },
      translation: {
        include: {
          vue: true,
          react: true,
        },
      },
    },
  })
  return tag
})
