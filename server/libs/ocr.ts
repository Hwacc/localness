/**
 * OCR Space API from https://github.com/DavideViolante/ocr-space-api-wrapper
 * @param b64Image base64 image
 * @param options OCR options
 * @returns OCR result
 */
export type OCRSpaceOptions = {
  language?: string
  isOverlayRequired?: boolean
  detectOrientation?: boolean
  isCreateSearchablePdf?: boolean
  isSearchablePdfHideTextLayer?: boolean
  scale?: boolean
  isTable?: boolean
  OCREngine?: number
}

export async function ocr(b64Image: string, options: OCRSpaceOptions = {}) {
  try {
    if (!b64Image) {
      throw Error('Image is required and must be typeof string')
    }
    const apiKey = process.env.NUXT_OCR_SPACE_KEY
    const {
      language,
      isOverlayRequired,
      detectOrientation,
      isCreateSearchablePdf,
      isSearchablePdfHideTextLayer,
      scale,
      isTable,
      OCREngine,
    } = options

    const formData = new FormData()
    formData.append('base64Image', b64Image)

    const _language = language || 'eng'
    if (_language === 'auto') {
      // Only OCREngine 2 supports auto as language
      formData.append('OCREngine', '2')
    } else {
      formData.append('OCREngine', String(OCREngine || '1'))
    }
    formData.append('language', String(_language))
    formData.append('isOverlayRequired', String(isOverlayRequired || 'false'))
    formData.append('detectOrientation', String(detectOrientation || 'false'))
    formData.append(
      'isCreateSearchablePdf',
      String(isCreateSearchablePdf || 'false')
    )
    formData.append(
      'isSearchablePdfHideTextLayer',
      String(isSearchablePdfHideTextLayer || 'false')
    )
    formData.append('scale', String(scale || 'false'))
    formData.append('isTable', String(isTable || 'false'))

    const result = await $fetch('https://api.ocr.space/parse/image', {
      method: 'POST',
      headers: {
        apikey: String(apiKey || 'helloworld'),
        'Content-Type': 'multipart/form-data',
        Accept: '*/*',
      },
      body: formData,
      maxContentLength: Infinity,
      maxBodyLength: Infinity,
    })
    return result
  } catch (error) {
    console.error(error)
    throw error
  }
}
