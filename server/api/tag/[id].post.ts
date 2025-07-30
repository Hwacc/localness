import prisma from '#server/libs/prisma'
import { readZodBody } from '#server/helper/validate'
import { numericID } from '#server/helper/id'

/**
 * @route POST /api/tag/:id
 * @description Update a tag
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
  const { settings, ...body } = await readZodBody(event, zTag.partial().parse)

  if (settings) {
    await prisma.tagSettings.upsert({
      where: {
        tagID: nID,
      },
      create: {
        tagID: nID,
        ...settings,
      },
      update: settings,
    })
  }

  const updatedTag = await prisma.tag.update({
    where: {
      id: nID,
    },
    data: body,
    include: {
      settings: {
        omit: {
          id: true,
          tagID: true,
          createdAt: true,
          updatedAt: true,
        },
      },
      translation: {
        include: {
          vue: true,
          react: true,
        },
      },
    },
  })
  return updatedTag
})
