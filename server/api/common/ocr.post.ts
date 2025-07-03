import { zOCR } from '~/constants/schemas'
import { ocr } from '~/server/libs/ocr'

export default defineEventHandler(async (event) => {
  await requireUserSession(event)
  const { image, language } = await readValidatedBody(event, zOCR.parse)
  const result = await ocr(image, { language })
  return result
})
