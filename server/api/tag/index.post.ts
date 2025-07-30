import prisma from '#server/libs/prisma'
import { readZodBody } from '#server/helper/validate'

/**
 * @route POST /api/tag
 * @description Create a new tag
 * @access Private
 */
export default defineEventHandler(async (event) => {
  await requireUserSession(event)
  const { settings, ...body } = await readZodBody(event, zTag.parse)
  if (!body.pageID) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Missing pageID',
    })
  }
  const page = await prisma.page.findUnique({
    where: {
      id: body.pageID as number,
    },
  })
  if (!page) {
    throw createError({
      statusCode: 404,
      statusMessage: 'Page not found',
    })
  }

  const createdTag = await prisma.tag.create({
    data: body,
  })

  await prisma.tagSettings.create({
    data: {
      tagID: createdTag.id,
      locked: settings?.locked ?? false,
      style: settings?.style ?? {},
      labelStyle: settings?.labelStyle ?? {},
      prompt: settings?.prompt ?? '',
    },
  })

  return await prisma.tag.findUnique({
    where: {
      id: createdTag.id,
    },
    include: {
      translation: {
        include: {
          vue: true,
          react: true,
        },
      },
      settings: {
        omit: {
          id: true,
          tagID: true,
          createdAt: true,
          updatedAt: true,
        },
      },
    },
  })
})
