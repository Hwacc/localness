import prisma from '#server/libs/prisma'

/**
 * @route GET /api/page
 * @description Get all pages
 * @access Private
 */
export default defineEventHandler(async (event) => {
  await requireUserSession(event)
  const pages = await prisma.page.findMany({
    include: {
      tags: true,
    },
    orderBy: {
      updatedAt: 'desc',
    },
  })
  return pages
})