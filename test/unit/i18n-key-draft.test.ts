import { describe, expect, it } from 'vitest'
import {
  hasUnpublishedDraft,
  isI18nKeyDraft,
  localeDraftWrite,
} from '#shared/utils'

const locale = (
  code: string,
  draftText: string | null,
  publishedText: string | null
) => ({ locale: code, draftText, publishedText })

describe('isI18nKeyDraft', () => {
  it('treats a key with no locale rows as a draft', () => {
    expect(isI18nKeyDraft([])).toBe(true)
  })

  it('treats never-published text as a draft', () => {
    expect(isI18nKeyDraft([locale('en', 'Save', null)])).toBe(true)
    expect(isI18nKeyDraft([locale('en', null, null)])).toBe(true)
  })

  it('is published when every locale matches what is live', () => {
    expect(
      isI18nKeyDraft([locale('en', 'Save', 'Save'), locale('ja', '保存', '保存')])
    ).toBe(false)
  })

  it('is a draft again as soon as one locale moves', () => {
    expect(
      isI18nKeyDraft([locale('en', 'Save', 'Save'), locale('ja', '保存中', '保存')])
    ).toBe(true)
  })
})

describe('hasUnpublishedDraft', () => {
  it('has nothing to publish when there are no locale rows', () => {
    expect(hasUnpublishedDraft([])).toBe(false)
  })

  it('has nothing to publish when no text exists at all', () => {
    // `isI18nKeyDraft` calls this a draft; publishing it would still change
    // nothing, and the endpoint answers zero. The two predicates are not
    // opposites, which is why both exist.
    expect(hasUnpublishedDraft([locale('en', null, null)])).toBe(false)
  })

  it('finds text that was never published', () => {
    expect(hasUnpublishedDraft([locale('en', 'Save', null)])).toBe(true)
  })

  it('finds text that moved since the last publish', () => {
    expect(
      hasUnpublishedDraft([locale('en', 'Save', 'Save'), locale('ja', '保存中', '保存')])
    ).toBe(true)
  })

  it('is false when every locale is already live', () => {
    expect(hasUnpublishedDraft([locale('en', 'Save', 'Save')])).toBe(false)
  })

  it('treats withdrawn text as unpublished', () => {
    expect(hasUnpublishedDraft([locale('en', null, 'Save')])).toBe(true)
  })
})

describe('localeDraftWrite', () => {
  const write = (input: {
    locale: string
    value: string
    previous: string
    sourceLocale?: string
  }) =>
    localeDraftWrite({ sourceLocale: 'en', ...input })

  it('sends nothing when the text did not move', () => {
    expect(write({ locale: 'ja', value: '保存', previous: '保存' })).toEqual({
      kind: 'unchanged',
    })
  })

  it('writes a changed non-source locale', () => {
    expect(write({ locale: 'ja', value: '保存中', previous: '保存' })).toEqual({
      kind: 'write',
      body: { ja: '保存中' },
    })
  })

  it('writes an emptied non-source locale rather than dropping it', () => {
    // Clearing a translation is a real edit; only the source is protected.
    expect(write({ locale: 'ja', value: '', previous: '保存' })).toEqual({
      kind: 'write',
      body: { ja: '' },
    })
  })

  it('refuses to blank the source text', () => {
    expect(write({ locale: 'en', value: '', previous: 'Save' })).toEqual({
      kind: 'source-required',
    })
  })

  it('refuses whitespace-only source text', () => {
    expect(write({ locale: 'en', value: '   ', previous: 'Save' })).toEqual({
      kind: 'source-required',
    })
  })

  it('writes a changed source text', () => {
    expect(write({ locale: 'en', value: 'Store', previous: 'Save' })).toEqual({
      kind: 'write',
      body: { en: 'Store' },
    })
  })

  it('never produces a null value the endpoint would read as "null"', () => {
    const result = write({ locale: 'ja', value: '', previous: '保存' })
    expect(result).toEqual({ kind: 'write', body: { ja: '' } })
  })

  it('allows whitespace-only text where the source is refused', () => {
    expect(write({ locale: 'ja', value: '  ', previous: '保存' })).toEqual({
      kind: 'write',
      body: { ja: '  ' },
    })
  })
})
