import prisma from '#server/libs/prisma'
import { numericID } from '#server/helper/id'
import { requirePageTeamMember } from '#server/helper/access'

/**
 * @route GET /api/page/:id
 * @description Get a page
 * @access Private
 */
export default defineEventHandler(async (event) => {
  const id = getRouterParam(event, 'id')
  if (!id) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Missing id',
    })
  }
  const nID = numericID(id)
  await requirePageTeamMember(event, nID)
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
