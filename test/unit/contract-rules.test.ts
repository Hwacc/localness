import { describe, expect, it } from 'vitest'
import {
  UNNAMED_KEY_PREFIX,
  LEGACY_DRAFT_KEY_PREFIX,
  entryMatchesReleaseFilter,
  formatI18nKeyDisplay,
  fpTranslation,
  isUnnamedKey,
} from '#shared/contract/rules'

// Golden values: a plugin and the server must mint the same unnamed key for the
// same sentence. If one of these changes, every stored `__unnamed_…` key and
// fingerprint stops matching, which is a breaking change of the package.
describe('fpTranslation', () => {
  it.each([
    ['Save', 'c9cc8cce247e49bae79f15173ce97354'],
    [' Save\nAs ', '3b9b4779908311c49e2126ca7e8ac8b3'],
    ['保存', 'be5fbbe34ce9979bfb6576d9eddc5612'],
  ])('hashes %j', (text, expected) => {
    expect(fpTranslation(text)).toBe(expected)
  })

  it('ignores whitespace', () => {
    expect(fpTranslation('Save As')).toBe(fpTranslation(' Save\nAs '))
  })
})

describe('unnamed key', () => {
  it('cuts a fingerprint to five characters, under either prefix', () => {
    expect(formatI18nKeyDisplay(`${UNNAMED_KEY_PREFIX}0123456789`)).toBe(
      `${UNNAMED_KEY_PREFIX}01234`
    )
    expect(formatI18nKeyDisplay(`${LEGACY_DRAFT_KEY_PREFIX}0123456789`)).toBe(
      `${LEGACY_DRAFT_KEY_PREFIX}01234`
    )
  })

  it('recognises both prefixes and nothing else', () => {
    expect(isUnnamedKey('__unnamed_ab12')).toBe(true)
    expect(isUnnamedKey('__draft_ab12')).toBe(true)
    expect(isUnnamedKey('btn.__draft_x')).toBe(false)
    expect(isUnnamedKey('draft_ab12')).toBe(false)
  })

  it('leaves other keys alone', () => {
    expect(formatI18nKeyDisplay('btn.save')).toBe('btn.save')
    expect(formatI18nKeyDisplay(null)).toBe('')
  })
})

describe('entryMatchesReleaseFilter', () => {
  it('compares ids across number and string', () => {
    expect(entryMatchesReleaseFilter(['7'], 7)).toBe(true)
    expect(entryMatchesReleaseFilter([7], 8)).toBe(false)
    expect(entryMatchesReleaseFilter(undefined, 'unassigned')).toBe(true)
  })
})
