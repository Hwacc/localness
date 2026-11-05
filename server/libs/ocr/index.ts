import { ocrSpace } from './ocrspace'
import { paddlex } from './paddlex'
import type { OcrProvider } from './types'

export type OcrProviderName = 'ocrspace' | 'paddlex'

/** Chosen by `NUXT_PUBLIC_OCR_PROVIDER`; public so the UI can hide options the provider ignores. */
export function ocrProviderName(): OcrProviderName {
  return process.env.NUXT_PUBLIC_OCR_PROVIDER === 'paddlex'
    ? 'paddlex'
    : 'ocrspace'
}

export function ocrProvider(): OcrProvider {
  const name = ocrProviderName()
  switch (name) {
    case 'ocrspace':
      return ocrSpace
    case 'paddlex':
      return paddlex
    default: {
      const unreachable: never = name
      throw new Error(`Unknown OCR provider: ${String(unreachable)}`)
    }
  }
}
