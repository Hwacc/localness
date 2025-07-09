import { zOCR } from '~/utils/schemas'
import { ocr } from '~/server/libs/ocr'
import prisma from '~/server/libs/prisma'
import { numericID } from '~/utils/id'
import { readZodBody } from '~/utils/validate'
import SparkMD5 from 'spark-md5'

export default defineEventHandler(async (event) => {
  await requireUserSession(event)
  const id = getRouterParam(event, 'id')
  if (!id) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Missing id',
    })
  }
  const nTagID = numericID(id)
  const tag = await prisma.tag.findUnique({
    where: { id: nTagID },
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

  const text = result.ParsedResults[0].ParsedText.replace(
    /([^a-zA-Z0-9\u4e00-\u9fa5])\r\n/g,
    ''
  )
    .replace(/\r\n$/, '')
    .replace(/\r\n/g, ' ')

  if(!text) return tag

  const md5 = SparkMD5.hash(text)
  const foundTranslation = await prisma.translation.findUnique({
    where: { md5 },
  })

  let updatedTag = null
  if(foundTranslation){
    // if has translation, update tag
    updatedTag = await prisma.tag.update({
      where: {
        id: nTagID,
      },
      data: {
        translationID: foundTranslation.id,
      },
      include: {
        translation: true,
      },
    })
  } else {
    // if no translation, create translation and update tag
    const createdTranslation = await prisma.translation.create({
      data: {
        origin: text,
        md5,
        tags: {
          connect: {
            id: nTagID,
          },
        },
      },
    })
    updatedTag = await prisma.tag.update({
      where: {
        id: nTagID,
      },
      data: {
        translationID: createdTranslation.id,
      },
      include: {
        translation: true,
      },
    })
  }
  console.log('updatedTag', updatedTag)
  return updatedTag
})
