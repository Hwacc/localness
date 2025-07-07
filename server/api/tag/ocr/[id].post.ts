import { zOCR } from '~/utils/schemas'
import { ocr } from '~/server/libs/ocr'
import prisma from '~/server/libs/prisma'
import { numericID } from '~/utils/id'
import { readZodBody } from '~/utils/validate'

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
  const tag = await prisma.tag.findUnique({
    where: { id: nID },
  })
  if (!tag) {
    throw createError({
      statusCode: 404,
      statusMessage: 'Tag not found',
    })
  }

  const { image } = await readZodBody(event, zOCR.parse)

  const nPageID = numericID(tag.pageID)
  const page = await prisma.page.findUnique({
    where: {
      id: nPageID,
    },
    include: {
      settings: true,
    },
  })
  if (!page) {
    throw createError({
      statusCode: 404,
      statusMessage: 'Page not found',
    })
  }

  const language = page.settings?.ocrLanguage ?? 'eng'
  const result = await ocr(image, { language })

  // TODO: format text
  const text = result.ParsedResults[0].ParsedText.replace(
    /([^a-zA-Z0-9\u4e00-\u9fa5])\r\n/g,
    ''
  )
    .replace(/\r\n$/, '')
    .replace(/\r\n/g, ' ')

  if (text) {
    await prisma.translation.upsert({
      where: {
        id: tag.translationID,
      },
      create: {
        tags: {
          connect: {
            id: nID,
          },
        },
        origin: text,
        i18nKey: ''
      },
      update: {
        origin: text,
      },
    })
  }

  const updatedTag = await prisma.tag.update({
    where: {
      id: nID,
    },
    data: {},
  })
  return updatedTag
})
