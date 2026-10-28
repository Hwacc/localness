import { describe, expect, it } from 'vitest'
import { autoFix, DEFAULT_SCAN_SETTINGS } from '#shared/utils/consistency'
import { allRules } from '#shared/utils/consistency/rules'
import {
  numberFormatAutoFix,
  numberShape,
  violatesLocale,
} from '#shared/utils/consistency/number-format'
import { ctx, key, published } from './helpers'

const format = allRules.find((rule) => rule.id === 'lint.number-format')!
const literal = allRules.find((rule) => rule.id === 'lint.number-literal')!

const run = (
  rule: typeof format,
  source: string,
  locale: string,
  text: string
) =>
  rule.detect(
    ctx([
      key({
        sourceText: source,
        locales: [published('en', source), published(locale, text)],
      }),
    ])
  )

describe('numberShape', () => {
  it.each([
    ['1,234,567', { kind: 'grouped', group: ',' }],
    ['1 234', { kind: 'grouped', group: ' ' }],
    ['1,234.56', { kind: 'both', group: ',', decimal: '.' }],
    ['1.234,56', { kind: 'both', group: '.', decimal: ',' }],
    ['3.14', { kind: 'decimal', decimal: '.' }],
    ['0.500', { kind: 'decimal', decimal: '.' }],
    ['1.000', { kind: 'ambiguous', sep: '.' }],
    ['1.2.3', null],
    ['12.05.2026', null],
  ])('%s', (raw, shape) => {
    expect(numberShape(raw)).toEqual(shape)
  })
})

describe('violatesLocale', () => {
  it('judges unambiguous writings', () => {
    expect(violatesLocale('1,234.56', 'de')).toBe(true)
    expect(violatesLocale('1.234,56', 'de')).toBe(false)
    expect(violatesLocale('1,5', 'en')).toBe(true)
    expect(violatesLocale('1.5', 'de')).toBe(true)
    expect(violatesLocale('1.5', 'en')).toBe(false)
    expect(violatesLocale('1 234,56', 'fr')).toBe(false)
  })

  it('skips unknown and non-latin locales', () => {
    expect(violatesLocale('1,234.56', 'xx-invalid-tag-!')).toBe(false)
  })

  it('reports an ambiguous number only when copied across a reading change', () => {
    const source = { locale: 'en', raws: new Set(['1.000']) }
    expect(violatesLocale('1.000', 'de', source)).toBe(true)
    expect(violatesLocale('1.000', 'de')).toBe(false)
    expect(violatesLocale('1.000', 'ja', source)).toBe(false)
    expect(violatesLocale('1.000', 'de', { ...source, raws: new Set() })).toBe(
      false
    )
  })
})

describe('lint.number-format', () => {
  it('flags a foreign separator in the translation', () => {
    const [finding] = run(format, 'Total 1,234.56', 'de', 'Summe 1,234.56')
    expect(finding?.severity).toBe('warning')
    expect(finding?.meta?.issues).toHaveLength(1)
  })

  it('accepts the locale convention', () => {
    expect(run(format, 'Total 1,234.56', 'de', 'Summe 1.234,56')).toEqual([])
  })

  it('skips versions glued to a letter', () => {
    expect(run(format, 'v1.5', 'de', 'v1.5')).toEqual([])
  })

  it('respects the lint switch', () => {
    const base = ctx([
      key({ locales: [published('en', 'a'), published('de', '1,234.56')] }),
    ])
    expect(
      format.detect({ ...base, lintRules: { 'lint.number-format': false } })
    ).toEqual([])
  })
})

describe('lint.number-literal', () => {
  it('flags a hard-coded grouped number in the source only', () => {
    expect(run(literal, '1,000 users', 'de', '1.000 Nutzer')).toHaveLength(1)
    expect(run(literal, '{count} users', 'de', '1.000 Nutzer')).toEqual([])
    expect(run(literal, 'Call 555 123 4567', 'de', 'x')).toEqual([])
  })
})

describe('numberFormatAutoFix', () => {
  it('rewrites two-separator numbers only', () => {
    expect(numberFormatAutoFix('Summe 1,234.56', 'de')).toBe('Summe 1.234,56')
    expect(numberFormatAutoFix('Total 1.234,56', 'en')).toBe('Total 1,234.56')
    expect(numberFormatAutoFix('Wert 1.5', 'de')).toBeNull()
  })

  it('is wired into autoFix', () => {
    const k = key({
      locales: [published('en', 'Total 1,234.56'), published('de', 'x')],
    })
    expect(
      autoFix(
        'lint.number-format',
        k,
        'en',
        'de',
        'Summe 1,234.56',
        DEFAULT_SCAN_SETTINGS
      )
    ).toBe('Summe 1.234,56')
  })
})
