import prisma from '#server/libs/prisma'
import { numericID } from '#server/helper/id'

/**
 * @route DELETE /api/page/:id
 * @description Delete a page
 * @access Private
 */
export default defineEventHandler(async (event) => {
  await requireUserSession(event)
  const ossStorage = event.context.ossStorage
  const id = getRouterParam(event, 'id')
  if (!id) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Missing id',
    })
  }
  const nID = numericID(id)
  const page = await prisma.page.findUnique({
    where: {
      id: nID,
    },
    select: {
      image: true,
    },
  })
  if (!page) {
    throw createError({
      statusCode: 404,
      statusMessage: 'Page not found',
    })
  }
  if (page.image) {
    try {
      await ossStorage.removeItem(page?.image || '')
    } catch (error) {
      console.error(error)
    }
  }
  const deletedPage = await prisma.page.delete({
    where: {
      id: nID,
    },
    include: {
      tags: true,
    },
  })
  return deletedPage
})
