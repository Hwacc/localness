import type { OcrProvider } from './types'

/** What `POST /ocr` of a PaddleX serving instance returns, as far as it is read here. */
export interface PaddlexResponse {
  errorCode?: number
  errorMsg?: string
  result?: {
    ocrResults?: Array<{
      prunedResult?: { rec_texts?: string[]; rec_scores?: number[] }
    }>
  }
}

export interface PaddlexRead {
  texts: string[]
  scores: number[]
}

/**
 * How far the detector grows each text box. 1.5 suits most screenshots; a
 * dark, small, tightly set line comes back with its words glued at 1.5 and
 * split at 2.0, while 2.0 drops a few spaces on light document text. Both are
 * sent explicitly: the service's own default differs between versions.
 */
export const UNCLIP_FIRST = 1.5
export const UNCLIP_RETRY = 2.0

/** The service takes a bare base64 string or a URL, not a `data:` URL. */
export function paddlexBody(input: string, unclipRatio: number) {
  const file = input.startsWith('http')
    ? input
    : input.replace(/^data:[^;,]*;base64,/, '')
  return { file, fileType: 1, textDetUnclipRatio: unclipRatio }
}

export function paddlexRead(res: PaddlexResponse): PaddlexRead {
  const pruned = (res.result?.ocrResults ?? []).map(
    (item) => item.prunedResult ?? {}
  )
  return {
    texts: pruned.flatMap((p) => p.rec_texts ?? []),
    scores: pruned.flatMap((p) => p.rec_scores ?? []),
  }
}

/**
 * Words run together. Average English words are ~5 letters, so 15 in a row is
 * rare in real copy, yet above common UI words like "Authentication" (14).
 * A lower-to-upper step inside 8+ letters ("SaveChanges") catches the shorter
 * glued Title Case labels. CJK never matches: only Latin letters count.
 */
export function looksGlued(texts: string[]) {
  return texts.some(
    (t) =>
      /[A-Za-z]{15,}/.test(t) ||
      (t.match(/[A-Za-z]{8,}/g) ?? []).some((run) => /[a-z][A-Z]/.test(run))
  )
}

function mean(scores: number[]) {
  return scores.length ? scores.reduce((a, b) => a + b, 0) / scores.length : 0
}

function spaces(texts: string[]) {
  return texts.join('').split(' ').length - 1
}

/**
 * Same letters, different breaks → the one with more spaces split the glued
 * words. Different letters → the more confident read, so a pass that broke a
 * word apart ("Set tings") cannot win on spaces alone.
 */
export function betterRead(a: PaddlexRead, b: PaddlexRead) {
  const bare = (r: PaddlexRead) => r.texts.join('').replace(/\s/g, '')
  if (bare(a) === bare(b)) return spaces(b.texts) > spaces(a.texts) ? b : a
  return mean(b.scores) > mean(a.scores) ? b : a
}

/**
 * A gateway in front of the service answers for it: 403 a wrong key, 413 a body
 * over its limit, 429/503 a request refused for load. Each gets a message that
 * says what to do; anything else passes through. A 403 is a deployment fault,
 * not the user's session, so it is not forwarded as one.
 */
export function paddlexError(error: unknown) {
  const status = (error as { statusCode?: number } | null)?.statusCode
  const messages: Record<number, [number, string]> = {
    403: [502, 'The OCR service refused the key. Check NUXT_OCR_PADDLEX_KEY.'],
    413: [413, 'The image is too large for the OCR service.'],
    429: [429, 'The OCR service is busy. Try again in a moment.'],
    503: [503, 'The OCR service is busy. Try again in a moment.'],
  }
  const hit = status === undefined ? undefined : messages[status]
  if (!hit) return error
  return createError({
    statusCode: hit[0],
    statusMessage: 'OCR service error',
    message: hit[1],
  })
}

async function call(url: string, input: string, unclipRatio: number) {
  const key = process.env.NUXT_OCR_PADDLEX_KEY
  const res = await $fetch<PaddlexResponse>(url, {
    method: 'POST',
    headers: {
      // Cloudflare's bot check may refuse Node's default agent.
      'User-Agent': `Localness/${useRuntimeConfig().public.appVersion}`,
      ...(key ? { 'X-API-Key': key } : {}),
    },
    body: paddlexBody(input, unclipRatio),
    timeout: 60_000,
  }).catch((error: unknown) => {
    throw paddlexError(error)
  })
  if (res.errorCode) {
    throw createError({
      statusCode: 502,
      statusMessage: 'OCR service error',
      message: `OCR failed (${res.errorCode}): ${res.errorMsg ?? 'unknown error'}`,
    })
  }
  return paddlexRead(res)
}

// The service has no language option, so `language` is ignored.
export const paddlex: OcrProvider = {
  async recognize(input) {
    const url = process.env.NUXT_OCR_PADDLEX_URL
    if (!url) {
      throw createError({
        statusCode: 500,
        statusMessage: 'OCR not configured',
        message: 'NUXT_OCR_PADDLEX_URL is not set.',
      })
    }
    const first = await call(url, input, UNCLIP_FIRST)
    if (!looksGlued(first.texts)) return first.texts.join('\n')
    // Serial on purpose: the service runs one request at a time, and the
    // gateway allows two connections. A failed retry keeps the first read.
    const retry = await call(url, input, UNCLIP_RETRY).catch(() => null)
    return (retry ? betterRead(first, retry) : first).texts.join('\n')
  },
}
