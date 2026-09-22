import { describe, expect, it } from 'vitest'
import type { KeyConvention } from '#shared/utils/key-convention'
import {
  DEFAULT_KEY_CONVENTION,
  checkI18nKey,
  slugKeyPrefix,
} from '#shared/utils/key-convention'
import {
  keyClashMessage,
  resolveKeyConvention,
  shapeKeyDuplicates,
  toKeyConvention,
} from '#server/helper/key-convention'

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

describe('toKeyConvention', () => {
  it('keeps the values it was given', () => {
    expect(
      toKeyConvention({
        keyPrefix: 'cortex',
        keySeparator: '.',
        keyStyle: 'camelCase',
        keyMaxDepth: 3,
      })
    ).toEqual({
      prefix: 'cortex',
      separator: '.',
      style: 'camelCase',
      maxDepth: 3,
    })
  })

  it('falls back to the defaults for a project with no settings row', () => {
    expect(toKeyConvention(null)).toEqual(DEFAULT_KEY_CONVENTION)
  })

  it('narrows a style written outside the API', () => {
    // These are plain string columns, so an unknown value has to be caught here
    // or the model and the validator would be handed different rules.
    expect(
      toKeyConvention({
        keyPrefix: 'a',
        keySeparator: '_',
        keyStyle: 'SCREAMING',
        keyMaxDepth: 4,
      }).style
    ).toBe(DEFAULT_KEY_CONVENTION.style)
  })

  it('refuses an empty separator, which would make segments unparseable', () => {
    expect(
      toKeyConvention({
        keyPrefix: 'a',
        keySeparator: '',
        keyStyle: 'snake_case',
        keyMaxDepth: 4,
      }).separator
    ).toBe(DEFAULT_KEY_CONVENTION.separator)
  })
})

describe('resolveKeyConvention', () => {
  const PROJECT = {
    keyPrefix: 'cortex',
    keySeparator: '_',
    keyStyle: 'snake_case',
    keyMaxDepth: 4,
  }
  const NOTHING = {
    keyPrefix: null,
    keySeparator: null,
    keyStyle: null,
    keyMaxDepth: null,
  }

  it('uses the project when the page sets nothing', () => {
    expect(resolveKeyConvention(NOTHING, PROJECT)).toEqual({
      prefix: 'cortex',
      separator: '_',
      style: 'snake_case',
      maxDepth: 4,
    })
  })

  it('lets the page override the project', () => {
    expect(
      resolveKeyConvention(
        {
          keyPrefix: 'app',
          keySeparator: '.',
          keyStyle: 'camelCase',
          keyMaxDepth: 3,
        },
        PROJECT
      )
    ).toEqual({
      prefix: 'app',
      separator: '.',
      style: 'camelCase',
      maxDepth: 3,
    })
  })

  it('keeps an empty prefix from the page instead of inheriting', () => {
    // The whole reason the page columns are nullable: `''` means "no prefix",
    // so it has to survive as a value rather than falling back to the project's.
    expect(
      resolveKeyConvention({ ...NOTHING, keyPrefix: '' }, PROJECT).prefix
    ).toBe('')
  })

  it('falls back field by field when a row only sets some', () => {
    expect(
      resolveKeyConvention({ ...NOTHING, keyPrefix: 'app' }, PROJECT)
        .separator
    ).toBe('_')
  })

  it('ends at the built-in defaults when neither level has anything', () => {
    expect(resolveKeyConvention(null, null)).toEqual(DEFAULT_KEY_CONVENTION)
  })

  it('normalises junk from the project level', () => {
    expect(
      resolveKeyConvention(null, {
        keyPrefix: 'a',
        keySeparator: '',
        keyStyle: 'SCREAMING',
        keyMaxDepth: 0,
      })
    ).toEqual({
      prefix: 'a',
      separator: DEFAULT_KEY_CONVENTION.separator,
      style: DEFAULT_KEY_CONVENTION.style,
      maxDepth: DEFAULT_KEY_CONVENTION.maxDepth,
    })
  })
})

describe('shapeKeyDuplicates', () => {
  it('calls a hit with the same text a reuse', () => {
    expect(
      shapeKeyDuplicates([{ key: 'demo_a_btn', origin: 'Sign in' }], 'Sign in')
    ).toEqual([{ key: 'demo_a_btn', origin: 'Sign in', sameOrigin: true }])
  })

  it('calls a hit with different text a clash', () => {
    expect(
      shapeKeyDuplicates([{ key: 'demo_a_btn', origin: 'Sign out' }], 'Sign in')
    ).toEqual([{ key: 'demo_a_btn', origin: 'Sign out', sameOrigin: false }])
  })

  it('ignores surrounding whitespace on either side', () => {
    expect(
      shapeKeyDuplicates(
        [{ key: 'demo_a_btn', origin: '  Sign in  ' }],
        'Sign in'
      )[0].sameOrigin
    ).toBe(true)
  })

  it('has nothing to say about an empty list', () => {
    expect(shapeKeyDuplicates([], 'Sign in')).toEqual([])
  })
})

describe('keyClashMessage', () => {
  it('points at the entry that already holds the same text', () => {
    expect(
      keyClashMessage({ key: 'a_btn', origin: 'Sign in' }, 'Sign in')
    ).toContain('same source text')
  })

  it('names the other text when the clash is a different one', () => {
    expect(
      keyClashMessage({ key: 'a_btn', origin: 'Sign out' }, 'Sign in')
    ).toContain('Sign out')
  })
})
