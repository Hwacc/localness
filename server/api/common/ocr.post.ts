import { zOCR } from '~/utils/schemas'
import { readZodBody } from '~/utils/validate'
import { ocr } from '~/server/libs/ocr'
import SparkMD5 from 'spark-md5'

export default defineEventHandler(async (event) => {
  await requireUserSession(event)

  const { image, language: lang } = await readZodBody(event, zOCR.parse)

  const language = lang ?? 'auto'
  const result = await ocr(image, { language })

  const text = result.ParsedResults[0].ParsedText.replace(
    /([^a-zA-Z0-9\u4e00-\u9fa5])\r\n/g,
    ''
  )
    .replace(/\r\n$/, '')
    .replace(/\r\n/g, ' ')

  if (!text) return null

  const md5 = SparkMD5.hash(text)
  return {
    text,
    md5,
  }
})
