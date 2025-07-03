import prisma from '~/server/libs/prisma'
import { zTag } from '~/constants/schemas'
import { readZodBody } from '~/utils/validate'

/**
 * @route POST /api/tag
 * @description Create a new tag
 * @access Private
 */
export default defineEventHandler(async (event) => {
  await requireUserSession(event)
  const data = await readZodBody(event, zTag.parse)

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
    data: data as any,
    include: {
      translation: true,
    },
  })
  return createdTag
})
