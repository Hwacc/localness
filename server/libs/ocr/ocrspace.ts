import type { OcrProvider } from './types'

enum OCRExitCode {
  Success = 1,
  PartialSuccess = 2,
  Failed = 3,
  Error = 4,
}

interface OCRResponse {
  ParsedResults: Array<{ ParsedText: string }>
  OCRExitCode: OCRExitCode
  ErrorMessage: string | null
}

/**
 * OCR.space's 429 would otherwise reach the client as a bare "Server Error".
 * Limits depend on the key's plan (the free one is per IP, so an office behind
 * one NAT shares it), so the message names no quota and passes on OCR.space's
 * own explanation when it sends one. With no key the public demo key is used,
 * shared by everyone.
 */
export function ocrUpstreamError(error: unknown, hasKey: boolean) {
  const { statusCode, data } =
    (error as { statusCode?: number; data?: unknown } | null) ?? {}
  if (statusCode !== 429) return error
  const detail = upstreamDetail(data)
  const base = hasKey
    ? 'OCR.space rate limit reached for the configured key. Check the limits of its plan, or try again later.'
    : 'OCR.space rate limit reached. NUXT_OCR_SPACE_KEY is not set, so the shared demo key is in use; set your own key.'
  return createError({
    statusCode: 429,
    statusMessage: 'OCR rate limited',
    message: detail ? `${base} (${detail})` : base,
  })
}

function upstreamDetail(data: unknown): string {
  const raw =
    typeof data === 'string'
      ? data
      : (data as { ErrorMessage?: unknown } | null)?.ErrorMessage
  const text = Array.isArray(raw) ? raw.join(' ') : raw
  return typeof text === 'string' ? text.trim().slice(0, 200) : ''
}

export const ocrSpace: OcrProvider = {
  async recognize(input, { language }) {
    // `||`, not `??`: the Docker env template ships both lines empty.
    const apiUrl =
      process.env.NUXT_PUBLIC_OCR_SPACE_DOMAIN ||
      'https://api.ocr.space/parse/image'
    const apiKey = process.env.NUXT_OCR_SPACE_KEY

    let field: 'url' | 'base64Image'
    if (input.startsWith('http')) field = 'url'
    else if (input.startsWith('data')) field = 'base64Image'
    else throw new Error('file is not supported yet')

    const lang = language || 'eng'
    const formData = new FormData()
    formData.append(field, input)
    // Only engine 2 supports `auto`.
    formData.append('OCREngine', lang === 'auto' ? '2' : '1')
    formData.append('language', lang)

    const result = await $fetch<OCRResponse>(apiUrl, {
      method: 'POST',
      headers: { apikey: String(apiKey || 'helloworld') },
      body: formData,
    }).catch((error: unknown) => {
      throw ocrUpstreamError(error, Boolean(apiKey))
    })

    if (
      result.OCRExitCode !== OCRExitCode.Success &&
      result.OCRExitCode !== OCRExitCode.PartialSuccess
    ) {
      throw new Error(
        result.ErrorMessage ??
          (result.OCRExitCode === OCRExitCode.Failed
            ? 'ORC Failed'
            : 'ORC Error')
      )
    }
    return result.ParsedResults[0]?.ParsedText ?? ''
  },
}
