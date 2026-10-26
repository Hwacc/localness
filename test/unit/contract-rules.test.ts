import { describe, expect, it } from 'vitest'
import {
  DRAFT_KEY_PREFIX,
  entryMatchesReleaseFilter,
  formatI18nKeyDisplay,
  fpTranslation,
} from '#shared/contract/rules'

// Golden values: a plugin and the server must mint the same draft key for the
// same sentence. If one of these changes, every stored `__draft_…` key and
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

describe('draft key display', () => {
  it('cuts a draft fingerprint to five characters', () => {
    expect(formatI18nKeyDisplay(`${DRAFT_KEY_PREFIX}0123456789`)).toBe(
      `${DRAFT_KEY_PREFIX}01234`
    )
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
