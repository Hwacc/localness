import prisma from '~/server/libs/prisma'
import { numericID } from '~/utils/id'

/**
 * @route GET /api/page/:id
 * @description Get a page
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

  const page = await prisma.page.findUnique({
    where: {
      id: nID,
    },
    include: {
      tags: true,
    },
  })

  return page
})
