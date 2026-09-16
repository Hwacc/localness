import { describe, expect, it } from 'vitest'
import { formatI18nKeyDisplay, resolveEditedKey } from '#shared/utils'

const LONG_DRAFT = '__draft_d86db734fe0ae1a9b9a9dafaf89e7687'

describe('formatI18nKeyDisplay', () => {
  it('leaves a hand-written key alone', () => {
    expect(formatI18nKeyDisplay('login.title')).toBe('login.title')
  })

  it('is empty for nothing', () => {
    expect(formatI18nKeyDisplay('')).toBe('')
    expect(formatI18nKeyDisplay(null)).toBe('')
    expect(formatI18nKeyDisplay(undefined)).toBe('')
  })

  it('shortens a draft key to five hash characters', () => {
    expect(formatI18nKeyDisplay(LONG_DRAFT)).toBe('__draft_d86db')
  })

  it('leaves a draft key whose hash is already short alone', () => {
    expect(formatI18nKeyDisplay('__draft_abc')).toBe('__draft_abc')
  })
})

describe('resolveEditedKey', () => {
  it('reports no change when the field still holds the display form', () => {
    expect(resolveEditedKey('login.title', 'login.title')).toBeNull()
    expect(resolveEditedKey('login.title', '  login.title  ')).toBeNull()
  })

  it('never saves the shortened display form over a full draft key', () => {
    // The load-bearing case: the cell shows `__draft_d86db`, and saving that
    // back verbatim would replace the whole fingerprint with its preview.
    expect(resolveEditedKey(LONG_DRAFT, '__draft_d86db')).toBeNull()
    expect(resolveEditedKey(LONG_DRAFT, ` ${LONG_DRAFT} `)).toBeNull()
  })

  it('takes a typed name as the new key', () => {
    expect(resolveEditedKey(LONG_DRAFT, 'login.title')).toBe('login.title')
    expect(resolveEditedKey(LONG_DRAFT, '  spaced.key  ')).toBe('spaced.key')
  })

  it('passes an emptied field through so the caller can reject it', () => {
    // Returning null here would silently keep the old key and re-show it in the
    // field, which reads as "my edit was ignored" rather than "a key is needed".
    expect(resolveEditedKey('login.title', '')).toBe('')
    expect(resolveEditedKey('login.title', '   ')).toBe('')
  })
})
