import prisma from "~/server/libs/prisma"
import { numericID } from "~/utils/id"

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
  if (isNaN(nID)) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Invalid id format',
    })
  }
  const tag = await prisma.tag.findUnique({
    where: {
      id: nID,
    },
    include: {
      translation: true,
    },
  })
  return tag
})