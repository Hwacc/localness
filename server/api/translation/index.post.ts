import { zTranslation } from '~/utils/schemas'
import { readZodBody } from '~/utils/validate'
import prisma from '~/server/libs/prisma'
import SparkMD5 from 'spark-md5'

/**
 * @route POST /api/translation
 * @description Create a new translation
 * @access Private
 */
export default defineEventHandler(async (event) => {
  await requireUserSession(event)
  const body = await readZodBody(event, zTranslation.parse)

  let md5 = body.md5
  if (!md5) {
    md5 = SparkMD5.hash(body.origin)
  }

  const translation = await prisma.translation.create({
    data: {
      origin: body.origin,
      md5,
      en: body.en || '',
      zh_cn: body.zh_cn || '',
      zh_tw: body.zh_tw || '',
      ja: body.ja || '',
      ko: body.ko || '',
      ru: body.ru || '',
      fr: body.fr || '',
      de: body.de || '',
      es: body.es || '',
      pt: body.pt || '',
    },
  })

  return translation
})
