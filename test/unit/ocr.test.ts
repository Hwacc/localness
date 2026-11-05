import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ocrUpstreamError } from '#server/libs/ocr/ocrspace'
import {
  betterRead,
  looksGlued,
  paddlex,
  paddlexBody,
  paddlexError,
  paddlexRead,
  UNCLIP_FIRST,
  UNCLIP_RETRY,
} from '#server/libs/ocr/paddlex'
import { ocrProviderName } from '#server/libs/ocr'

// Nitro auto-imports `createError`; echoing the input lets the message be read back.
vi.stubGlobal('createError', (input: Record<string, unknown>) => input)

function upstream(statusCode: number, data?: unknown) {
  return Object.assign(new Error('upstream'), { statusCode, data })
}

describe('ocrUpstreamError', () => {
  it('turns an OCR.space 429 into a 429 that tells a missing key apart', () => {
    const noKey = ocrUpstreamError(upstream(429), false) as {
      statusCode: number
      message: string
    }
    expect(noKey.statusCode).toBe(429)
    expect(noKey.message).toContain('NUXT_OCR_SPACE_KEY is not set')

    const keyed = ocrUpstreamError(upstream(429), true) as { message: string }
    expect(keyed.message).not.toContain('NUXT_OCR_SPACE_KEY')
  })

  it("appends OCR.space's own explanation, whatever the plan", () => {
    const text = ocrUpstreamError(
      upstream(429, 'You may only perform this action upto maximum 180 number of times within 3600 seconds'),
      true
    ) as { message: string }
    expect(text.message).toContain('(You may only perform this action')

    const json = ocrUpstreamError(
      upstream(429, { ErrorMessage: ['Rate limit exceeded'] }),
      true
    ) as { message: string }
    expect(json.message).toContain('(Rate limit exceeded)')
  })

  it('passes any other failure through unchanged', () => {
    const badGateway = upstream(502)
    expect(ocrUpstreamError(badGateway, true)).toBe(badGateway)
    const network = new TypeError('fetch failed')
    expect(ocrUpstreamError(network, true)).toBe(network)
  })
})

describe('ocrProviderName', () => {
  it('defaults to ocrspace and only switches on an exact paddlex', () => {
    vi.stubEnv('NUXT_PUBLIC_OCR_PROVIDER', '')
    expect(ocrProviderName()).toBe('ocrspace')
    vi.stubEnv('NUXT_PUBLIC_OCR_PROVIDER', 'paddlex')
    expect(ocrProviderName()).toBe('paddlex')
    vi.unstubAllEnvs()
  })
})

describe('paddlex', () => {
  it('strips the data: prefix, leaves a URL alone, and sends the unclip ratio', () => {
    expect(paddlexBody('data:image/png;base64,AAAA', 1.5)).toEqual({
      file: 'AAAA',
      fileType: 1,
      textDetUnclipRatio: 1.5,
    })
    expect(paddlexBody('https://x.test/a.png', 1.5).file).toBe('https://x.test/a.png')
  })

  it('reads lines and scores, tolerating an empty result', () => {
    const res = {
      result: {
        ocrResults: [
          { prunedResult: { rec_texts: ['Hello', 'World'], rec_scores: [0.9, 0.8] } },
        ],
      },
    }
    expect(paddlexRead(res)).toEqual({ texts: ['Hello', 'World'], scores: [0.9, 0.8] })
    expect(paddlexRead({})).toEqual({ texts: [], scores: [] })
  })

  it('flags glued words but not long real ones or CJK', () => {
    expect(looksGlued(['Pleaseenteryourpassword'])).toBe(true)
    expect(looksGlued(['ForgotPassword'])).toBe(true)
    expect(looksGlued(['Authentication settings'])).toBe(false)
    expect(looksGlued(['Notifications', 'iPhone'])).toBe(false)
    expect(looksGlued(['请输入您的账户密码以继续操作下一步'])).toBe(false)
  })

  it('prefers more spaces only when the letters agree', () => {
    const glued = { texts: ['SaveChanges'], scores: [0.95] }
    const split = { texts: ['Save Changes'], scores: [0.9] }
    expect(betterRead(glued, split)).toBe(split)

    const broken = { texts: ['Set tings'], scores: [0.6] }
    const right = { texts: ['Settngs'], scores: [0.9] }
    expect(betterRead(right, broken)).toBe(right)
  })

  it('maps gateway refusals and passes the rest through', () => {
    const busy = paddlexError(upstream(429)) as { statusCode: number }
    expect(busy.statusCode).toBe(429)
    expect((paddlexError(upstream(403)) as { statusCode: number }).statusCode).toBe(502)
    const other = upstream(500)
    expect(paddlexError(other)).toBe(other)
  })
})

describe('paddlex.recognize', () => {
  function reply(texts: string[], scores = texts.map(() => 0.9)) {
    return { result: { ocrResults: [{ prunedResult: { rec_texts: texts, rec_scores: scores } }] } }
  }

  function serve(...replies: Array<object | Error>) {
    const fetch = vi.fn()
    for (const r of replies) {
      if (r instanceof Error) fetch.mockRejectedValueOnce(r)
      else fetch.mockResolvedValueOnce(r)
    }
    vi.stubGlobal('$fetch', fetch)
    return fetch
  }

  const ratios = (fetch: ReturnType<typeof vi.fn>) =>
    fetch.mock.calls.map((c) => (c[1] as { body: { textDetUnclipRatio: number } }).body.textDetUnclipRatio)

  beforeEach(() => {
    vi.stubEnv('NUXT_OCR_PADDLEX_URL', 'http://ocr.test/ocr')
    vi.stubGlobal('useRuntimeConfig', () => ({ public: { appVersion: '0.0.0' } }))
  })
  afterEach(() => vi.unstubAllEnvs())

  it('calls once when nothing looks glued', async () => {
    const fetch = serve(reply(['Save changes']))
    expect(await paddlex.recognize('data:,x', {})).toBe('Save changes')
    expect(ratios(fetch)).toEqual([UNCLIP_FIRST])
  })

  it('retries with the wider ratio and keeps the split read', async () => {
    const fetch = serve(reply(['SaveChanges']), reply(['Save Changes']))
    expect(await paddlex.recognize('data:,x', {})).toBe('Save Changes')
    expect(ratios(fetch)).toEqual([UNCLIP_FIRST, UNCLIP_RETRY])
  })

  it('keeps the first read when the retry fails', async () => {
    serve(reply(['SaveChanges']), upstream(429))
    expect(await paddlex.recognize('data:,x', {})).toBe('SaveChanges')
  })

  it('turns a service-level errorCode into an error', async () => {
    serve({ errorCode: 500, errorMsg: 'boom' })
    await expect(paddlex.recognize('data:,x', {})).rejects.toMatchObject({
      statusCode: 502,
      message: 'OCR failed (500): boom',
    })
  })
})
