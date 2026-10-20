import { describe, expect, it } from 'vitest'
import {
  DEFAULT_SCAN_SETTINGS,
  detectAll,
  mismatchAutoFix,
  recheckLocale,
  withPluralFamilies,
  type I18nDialect,
  type ScanKeyInput,
} from '#shared/utils/consistency'
import { placeholdersRule } from '#shared/utils/consistency/rules/placeholders'
import { numbersRule } from '#shared/utils/consistency/rules/numbers'
import { ctx, key, published } from './helpers'

const pair = (source: string, text: string) =>
  key({ locales: [published('en', source), published('de', text)] })

const placeholderIssues = (dialect: I18nDialect, keys: ScanKeyInput[]) =>
  placeholdersRule
    .detect(ctx(keys, { dialect }))
    .flatMap((finding) => finding.meta?.issues as Array<{ missing: string[]; extra: string[] }>)

describe('message syntax by dialect', () => {
  it('reads {name} as literal text in i18next', () => {
    const keys = [pair('Hello {name} and {{user}}', 'Hallo und {{user}}')]
    expect(placeholderIssues('auto', keys)).toMatchObject([
      { missing: ['{name}'] },
    ])
    expect(placeholderIssues('i18next', keys)).toEqual([])
  })

  it('reads @:key as literal text in i18next', () => {
    const keys = [pair('See @:common.save', 'Siehe')]
    expect(placeholderIssues('vue-i18n', keys)).toMatchObject([
      { missing: ['@:common.save'] },
    ])
    expect(placeholderIssues('i18next', keys)).toEqual([])
  })

  it('reads $t() nesting in i18next, not in vue-i18n', () => {
    const keys = [pair('Press $t(common.save) now', 'Drücke jetzt')]
    expect(placeholderIssues('i18next', keys)).toMatchObject([
      { missing: ['$t(common.save)'] },
    ])
    expect(placeholderIssues('vue-i18n', keys)).toEqual([])
  })

  it('compares the nested key, not its options', () => {
    const keys = [
      pair('$t(items, { "count": {{n}} })', '$t(items, {"count": {{n}}})'),
    ]
    expect(placeholderIssues('i18next', keys)).toEqual([])
  })

  it('counts a pipe as text in i18next, as branches in vue-i18n', () => {
    expect(
      placeholderIssues('vue-i18n', [pair('{n} a | {n} b', '{n} x | {n} y | {n} z')])
    ).toEqual([])
    expect(
      placeholderIssues('i18next', [
        pair('{{n}} a | {{n}} b', '{{n}} x | {{n}} y | {{n}} z'),
      ])
    ).toMatchObject([{ extra: ['{{n}}'] }])
  })

  it('reads list placeholders {0} and keeps them out of Numbers', () => {
    const keys = [pair('{0} of {1}', '{0} von')]
    expect(placeholderIssues('vue-i18n', keys)).toMatchObject([
      { missing: ['{1}'] },
    ])
    expect(numbersRule.detect(ctx(keys))).toEqual([])
  })

  it('has no plural key families in vue-i18n', () => {
    const keys = [key({ key: 'step_one' }), key({ key: 'step_other' })]
    expect(
      withPluralFamilies(keys, 'en', { dialect: 'vue-i18n' }).some(
        (k) => k.pluralFamily
      )
    ).toBe(false)
    expect(
      withPluralFamilies(keys, 'en', { dialect: 'i18next' }).every(
        (k) => k.pluralFamily
      )
    ).toBe(true)
  })

  it('swaps a nested key one for one', () => {
    const k = pair('Press $t(common.save)', 'Drücke $t(common.ok)')
    expect(
      mismatchAutoFix('placeholders', k, 'en', 'de', 'Drücke $t(common.ok)', {
        ...DEFAULT_SCAN_SETTINGS,
        dialect: 'i18next',
      })
    ).toBe('Drücke $t(common.save)')
  })
})

describe('rule severity overrides', () => {
  const keys = [pair('Up to 5 files', 'Bis zu 6 Dateien')]

  it('keeps the default without an override', () => {
    expect(
      detectAll(ctx(keys)).filter((f) => f.ruleId === 'numbers')
    ).toMatchObject([{ severity: 'error' }])
  })

  it('re-grades a rule', () => {
    expect(
      detectAll(ctx(keys, { ruleSeverity: { numbers: 'warning' } })).filter(
        (f) => f.ruleId === 'numbers'
      )
    ).toMatchObject([{ severity: 'warning' }])
  })

  it('turns a rule off for the scan and the recheck', () => {
    const settings = { ...DEFAULT_SCAN_SETTINGS, ruleSeverity: { numbers: 'off' as const } }
    expect(
      detectAll(ctx(keys, settings)).filter((f) => f.ruleId === 'numbers')
    ).toEqual([])
    expect(
      recheckLocale('numbers', keys[0]!, 'en', 'de', 'Bis zu 6 Dateien', settings)
    ).toBeNull()
  })
})
