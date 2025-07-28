import prisma from '#server/libs/prisma'
import OSSManager from '#server/libs/oss'
import { numericID } from '#server/helper/id'

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
  const deleteAssetFlag = await OSSManager.deleteAsset(page?.image || '')
  if (!deleteAssetFlag) {
    throw createError({
      statusCode: 500,
      statusMessage: 'Failed to delete oss asset',
    })
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
