import { describe, expect, it } from 'vitest'
import { zAiTranslateAccept, zAiTranslateSingle } from '#shared/schemas'

describe('ai translate single / accept schemas', () => {
  it('saves by default, and only a proposal says otherwise', () => {
    expect(zAiTranslateSingle.parse({ keyId: 1, locale: 'fr' }).save).toBe(true)
    expect(
      zAiTranslateSingle.parse({ keyId: 1, locale: 'fr', save: false }).save
    ).toBe(false)
  })

  it('refuses to accept an empty or blank proposal', () => {
    expect(() =>
      zAiTranslateAccept.parse({ keyId: 1, locale: 'fr', text: '   ' })
    ).toThrow()
    expect(
      zAiTranslateAccept.parse({ keyId: 1, locale: 'fr', text: 'Bonjour' }).text
    ).toBe('Bonjour')
  })

  it('needs a real key id', () => {
    expect(() =>
      zAiTranslateAccept.parse({ keyId: 0, locale: 'fr', text: 'x' })
    ).toThrow()
  })
})
