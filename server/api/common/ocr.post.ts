import { ocr } from '#server/libs/ocr'
import { readZodBody } from '#server/helper/validate'

/**
 * @route POST /api/common/ocr
 * @description OCR image
 * @access Private
 */
export default defineEventHandler(async (event) => {
  await requireUserSession(event)
  const { image, language: lang } = await readZodBody(event, zOCR.parse)
  const language = lang ?? 'auto'
  const result = await ocr(image, { language })
  if (!result) return null
  const text = result.ParsedResults[0].ParsedText.replace(
    /([^a-zA-Z0-9\u4e00-\u9fa5])\r\n/g,
    ''
  )
    .replace(/[\r\n]$/, '')
    .replace(/[\r\n]/g, ' ')
    .replace(/\n/g, ' ')

  if (!text) return null
  const fingerprint = fpTranslation(text)
  if (!fingerprint) return null
  return {
    text,
    fingerprint,
  }
})
