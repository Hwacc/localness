import { describe, expect, it } from 'vitest'
import { localeCoverageState } from '#shared/utils/coverage'

function key(
  dirty: boolean,
  locales: Array<{
    locale: string
    draftText: string | null
    publishedText: string | null
    sourceFingerprint?: string
  }>,
) {
  return { dirty, fingerprint: 'fp-now', locales }
}

describe('localeCoverageState', () => {
  it('reports a locale with no row or only empty text as missing', () => {
    const k = key(true, [{ locale: 'de', draftText: '', publishedText: null }])
    expect(localeCoverageState(k, 'de', 'en')).toBe('missing')
    expect(localeCoverageState(k, 'fr', 'en')).toBe('missing')
  })

  it('reports text that matches what is published as published', () => {
    const k = key(false, [
      { locale: 'de', draftText: 'Hallo', publishedText: 'Hallo', sourceFingerprint: 'fp-now' },
    ])
    expect(localeCoverageState(k, 'de', 'en')).toBe('published')
  })

  it('reports unpublished or changed text as draft', () => {
    const k = key(true, [
      { locale: 'de', draftText: 'Hallo', publishedText: null },
      { locale: 'ja', draftText: 'こんにちは', publishedText: 'やあ' },
      { locale: 'fr', draftText: '', publishedText: 'Salut' },
    ])
    expect(localeCoverageState(k, 'de', 'en')).toBe('draft')
    expect(localeCoverageState(k, 'ja', 'en')).toBe('draft')
    expect(localeCoverageState(k, 'fr', 'en')).toBe('draft')
  })

  it('reports a published key whose translation predates the source as outdated', () => {
    const k = key(false, [
      { locale: 'de', draftText: 'Hallo', publishedText: 'Hallo', sourceFingerprint: 'fp-old' },
    ])
    expect(localeCoverageState(k, 'de', 'en')).toBe('outdated')
  })

  it('never reports a draft key or the source locale as outdated', () => {
    const draft = key(true, [
      { locale: 'de', draftText: 'Hallo', publishedText: null, sourceFingerprint: 'fp-old' },
    ])
    expect(localeCoverageState(draft, 'de', 'en')).toBe('draft')
    const published = key(false, [
      { locale: 'en', draftText: 'Hi', publishedText: 'Hi', sourceFingerprint: 'fp-old' },
    ])
    expect(localeCoverageState(published, 'en', 'en')).toBe('published')
  })
})
