import { describe, expect, it } from 'vitest'
import type { KeyConvention } from '#shared/utils/key-convention'
import {
  DEFAULT_KEY_CONVENTION,
  checkI18nKey,
  slugKeyPrefix,
} from '#shared/utils/key-convention'

const SNAKE: KeyConvention = { ...DEFAULT_KEY_CONVENTION, prefix: 'demo' }
const DOTTED: KeyConvention = {
  prefix: '',
  separator: '.',
  style: 'camelCase',
  maxDepth: 4,
}

describe('checkI18nKey', () => {
  it('accepts a key that follows the convention', () => {
    expect(checkI18nKey('demo_checkout_order_btn', SNAKE)).toEqual([])
  })

  it('accepts an empty key: a symbol-only line has nothing to name', () => {
    expect(checkI18nKey('', SNAKE)).toEqual([])
  })

  it('demands a prefix only when one is configured', () => {
    expect(checkI18nKey('checkout_order_btn', SNAKE)).toContain('prefix')
    expect(checkI18nKey('checkout_order_btn', DEFAULT_KEY_CONVENTION)).toEqual(
      [],
    )
  })

  it('flags a prefix that is not followed by the separator', () => {
    expect(checkI18nKey('democheckout_order_btn', SNAKE)).toContain('prefix')
  })

  it('leaves the configured prefix out of the rules it enforces', () => {
    // The prefix is copied into every key verbatim, so what it contains is the
    // project's own choice — the rules govern the path after it.
    const convention: KeyConvention = { ...SNAKE, prefix: 'my-app' }

    expect(checkI18nKey('my-app_checkout_btn', convention)).toEqual([])
  })

  it('flags a separator the convention does not use', () => {
    expect(checkI18nKey('demo_checkout.order_btn', SNAKE)).toContain('charset')
  })

  it('flags the wrong casing for the style', () => {
    expect(checkI18nKey('demo_Checkout_btn', SNAKE)).toContain('case')
    expect(checkI18nKey('Checkout_btn', DOTTED)).toContain('case')
  })

  it('accepts camelCase inside a segment when that is the style', () => {
    expect(checkI18nKey('login.submitButton', DOTTED)).toEqual([])
  })

  it('flags an empty segment, in the middle or at the end', () => {
    expect(checkI18nKey('demo_checkout__btn', SNAKE)).toContain('segment')
    expect(checkI18nKey('demo_checkout_btn_', SNAKE)).toContain('segment')
  })

  it('flags a key deeper than the convention allows', () => {
    expect(checkI18nKey('demo_a_b_c_d', SNAKE)).toEqual([])
    expect(checkI18nKey('demo_a_b_c_d_e', SNAKE)).toContain('depth')
  })

  it('reports nothing when there is no separator to split on', () => {
    expect(checkI18nKey('anything', { ...SNAKE, separator: '' })).toEqual([])
  })
})

describe('slugKeyPrefix', () => {
  it('lowercases a plain name', () => {
    expect(slugKeyPrefix('Localness')).toBe('localness')
  })

  it('drops a trailing non-latin run instead of leaving a separator', () => {
    expect(slugKeyPrefix('Localness 平台')).toBe('localness')
  })

  it('falls back to no prefix when the name has nothing latin in it', () => {
    expect(slugKeyPrefix('平台')).toBe('')
  })

  it('keeps an underscore that was already there', () => {
    expect(slugKeyPrefix('My_App')).toBe('my_app')
  })

  it('collapses runs of junk and trims the edges', () => {
    expect(slugKeyPrefix('  Hello -- World  ')).toBe('hello_world')
  })

  it('is empty for an empty name', () => {
    expect(slugKeyPrefix('')).toBe('')
  })
})
