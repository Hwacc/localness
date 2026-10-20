import { describe, expect, it } from 'vitest'
import { autoFix, mismatchAutoFix } from '#shared/utils/consistency'
import { key, published } from './helpers'

const fix = (ruleId: string, source: string, text: string, keyName?: string) =>
  mismatchAutoFix(
    ruleId,
    key({
      ...(keyName ? { key: keyName } : {}),
      locales: [published('en', source), published('de', text)],
    }),
    'en',
    'de',
    text
  )

describe('mismatchAutoFix', () => {
  it('renames a placeholder one for one', () => {
    expect(fix('placeholders', 'Hi {name}, %s', 'Hallo {n}, %s')).toBe(
      'Hallo {name}, %s'
    )
  })

  it('pairs by kind and position', () => {
    expect(
      fix('placeholders', '{a} and {{b}} then {c}', '{x} und {{y}} dann {z}')
    ).toBe('{a} und {{b}} dann {c}')
  })

  it('swaps a linked key', () => {
    expect(fix('placeholders', 'See @:common.save', 'Siehe @:common.store')).toBe(
      'Siehe @:common.save'
    )
  })

  it('swaps an edited URL and email', () => {
    expect(
      fix(
        'urls-emails',
        'Visit https://a.dev or mail hi@a.dev',
        'Besuche https://b.dev oder hi@b.dev'
      )
    ).toBe('Besuche https://a.dev oder hi@a.dev')
  })

  it('renames an opening and closing tag together', () => {
    expect(fix('html-tags', 'Click <bold>here</bold>', 'Klick <b>hier</b>')).toBe(
      'Klick <bold>hier</bold>'
    )
  })

  it('fixes every branch of a plural text', () => {
    expect(
      fix('placeholders', 'one file | {n} files', 'eine Datei | {count} Dateien | {count}')
    ).toBe('eine Datei | {n} Dateien | {n}')
  })

  it('offers nothing for a pure gap, a kind change or numbers', () => {
    expect(fix('placeholders', 'Hi {name}', 'Hallo')).toBeNull()
    expect(fix('placeholders', 'Hi {name}', 'Hallo %s')).toBeNull()
    expect(fix('html-tags', '<0>a</0>', 'a<0>')).toBeNull()
    expect(fix('numbers', 'Wait 5 min', 'Warte 6 min')).toBeNull()
  })

  it('offers nothing when the translation already passes', () => {
    expect(fix('placeholders', 'Hi {name}', 'Hallo {name}')).toBeNull()
  })
})

describe('autoFix', () => {
  it('routes lint rules to their rewrite', () => {
    expect(autoFix('lint.ellipsis', key(), 'en', 'de', 'Warte...')).toBe(
      'Warte…'
    )
  })
})
