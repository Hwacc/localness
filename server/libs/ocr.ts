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

export enum OCRExitCode {
  Success = 1,
  PartialSuccess = 2,
  Failed = 3,
  Error = 4,
}

export enum OCRFileParseExitCode {
  NotFound = 0,
  Success = 1,
  EngineError = -10,
  TimeOut = -20,
  ValidationError = -30,
  UnknownError = -99,
}

export interface OCRWord {
  WordText: string
  Left: number
  Top: number
  Width: number
  Height: number
}
export interface OCRLine {
  LineText: string
  Words: OCRWord[]
  MaxHeight: number
  MinTop: number
}
export interface OCRTextOverlay {
  Lines: []
  HasOverlay: boolean
  Message: string
}

export interface OCRParsedResult {
  FileParseExitCode: OCRFileParseExitCode
  ParsedText: string
  TextOverlay?: OCRTextOverlay[]
  ErrorMessage: string | null
  ErrorDetails: string | null
}

export interface OCRResponse {
  ParsedResults: OCRParsedResult[]
  OCRExitCode: OCRExitCode
  IsErroredOnProcessing: boolean
  ErrorMessage: string | null
  ErrorDetails: string | null
  SearchablePDFURL: string | null
  ProcessingTimeInMilliseconds: number
}

function detectInput(input: string) {
  if (input.startsWith('http')) return 'url'
  if (input.startsWith('data')) return 'base64Image'
  return 'file'
}

export async function ocr(input: string, options: OCRSpaceOptions = {}) {
  const apiUrl =
    process.env.NUXT_PUBLIC_OCR_SPACE_DOMAIN ??
    'https://api.ocr.space/parse/image'
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

  const inputType = detectInput(input)
  if (inputType === 'file') {
    throw new Error('file is not supported yet')
  }
  const formData = new FormData()
  formData.append(inputType, input)

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

  const result = await $fetch<OCRResponse>(apiUrl, {
    method: 'POST',
    headers: {
      apikey: String(apiKey || 'helloworld'),
    },
    body: formData,
  })

  if (
    !(
      result.OCRExitCode === OCRExitCode.Success ||
      result.OCRExitCode === OCRExitCode.PartialSuccess
    )
  ) {
    const makeMessage = () => {
      switch (result.OCRExitCode) {
        case OCRExitCode.Failed:
          return 'ORC Failed'
        case OCRExitCode.Error:
          return 'ORC Error'
        default:
          return 'ORC Unknown Error'
      }
    }
    throw new Error(result.ErrorMessage ?? makeMessage())
  }
  return result
}
