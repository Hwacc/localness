import prisma from '#server/libs/prisma'
import { readZodBody } from '#server/helper/validate'

/**
 * @route POST /api/tag
 * @description Create a new tag
 * @access Private
 */
export default defineEventHandler(async (event) => {
  await requireUserSession(event)
  const data = await readZodBody(event, zTag.parse)
  if (!data.pageID) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Missing pageID',
    })
  }
  const page = await prisma.page.findUnique({
    where: {
      id: data.pageID as number,
    },
  })
  if (!page) {
    throw createError({
      statusCode: 404,
      statusMessage: 'Page not found',
    })
  }

  const createdTag = prisma.tag.create({
    data: data,
    include: {
      translation: {
        include: {
          vue: true,
          react: true,
        },
      },
    },
  })
  return createdTag
})
