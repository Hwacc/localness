import prisma from '~/server/libs/prisma'
import { deleteAsset } from '~/server/libs/qiniu'
import { numericID } from '~/utils/id'

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
      id: nID,
    },
    include: {
      tags: true,
    },
  })
  return deletedPage
})
