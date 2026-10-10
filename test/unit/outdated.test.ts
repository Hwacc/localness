import { describe, expect, it } from 'vitest'
import { isTranslationOutdated } from '#shared/utils/outdated'

const base = {
  locale: 'ja',
  sourceLocale: 'en',
  draftText: '保存',
  publishedText: '保存',
  sourceFingerprint: 'old',
  keyFingerprint: 'new',
}

describe('isTranslationOutdated', () => {
  it('marks a translation written against an older source sentence', () => {
    expect(isTranslationOutdated(base)).toBe(true)
  })

  it('is fresh when the stamp matches the current source', () => {
    expect(isTranslationOutdated({ ...base, sourceFingerprint: 'new' })).toBe(false)
  })

  it('ignores the source locale', () => {
    expect(isTranslationOutdated({ ...base, locale: 'en' })).toBe(false)
  })

  it('ignores a draft key — it can still change', () => {
    expect(isTranslationOutdated({ ...base, keyIsDraft: true })).toBe(false)
  })

  it('ignores an empty translation — missing is not outdated', () => {
    expect(
      isTranslationOutdated({ ...base, draftText: '', publishedText: null })
    ).toBe(false)
  })
})
