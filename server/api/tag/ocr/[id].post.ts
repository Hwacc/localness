import { zOCR } from '~/constants/schemas'
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

  const { image, language } = await readZodBody(event, zOCR.parse)
  const result = await ocr(image, { language })
  // TODO: format text
  const text = result.ParsedResults[0].ParsedText
    .replace(/([^a-zA-Z0-9\u4e00-\u9fa5])\r\n/g, '')
    .replace(/\r\n$/, '')
    .replace(/\r\n/g, ' ')

  const updatedTag = await prisma.tag.update({
    where: {
      id: nID,
    },
    data: {
      text,
    },
  })
  return updatedTag
})
