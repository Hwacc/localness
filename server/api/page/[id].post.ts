import prisma from '#server/libs/prisma'
import { numericID } from '#server/helper/id'
import { readZodBody } from '#server/helper/validate'
import { z } from 'zod/v4'

/**
 * @route POST /api/page/:id
 * @description Update a page
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
  const { name, image, settings } = await readZodBody(
    event,
    zPage.extend({
      image: z.string().optional(),
    }).parse
  )
  if (!name) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Missing name',
    })
  }

  const data = image ? { name, image } : { name }
  if (settings) {
    await prisma.pageSettings.upsert({
      where: {
        pageID: nID,
      },
      create: {
        pageID: nID,
        ocrLanguage: settings?.ocrLanguage ?? 'eng',
        ocrEngine: settings?.ocrEngine ?? 1,
        prompt: settings?.prompt ?? '',
      },
      update: settings,
    })
  }
  const updatedProject = await prisma.page.update({
    where: {
      id: nID,
    },
    data,
    select: {
      id: true,
      name: true,
      image: true,
      updatedAt: true,
      settings: {
        omit: {
          id: true,
          pageID: true,
          createdAt: true,
          updatedAt: true,
        },
      },
    },
  })

  return updatedProject
})
