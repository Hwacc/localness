import prisma from '~/libs/prisma'
import { deleteAsset } from '~/libs/qiniu'

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
  const page = await prisma.page.findUnique({
    where: {
      id: numericID,
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
  const deleteAssetFlag = await deleteAsset(page?.image || '')
  if (!deleteAssetFlag) {
    throw createError({
      statusCode: 500,
      statusMessage: 'Failed to delete oss asset',
    })
  }
  const deletedPage = await prisma.page.delete({
    where: {
      id: numericID,
    },
    include: {
      tags: true,
    },
  })
  return deletedPage
})
