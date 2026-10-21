import { describe, expect, it } from 'vitest'
import {
  allRules,
  detectAll,
  keyRules,
  withPluralFamilies,
  type ScanKeyInput,
} from '#shared/utils/consistency'
import { ctx, key, published } from './helpers'

function project(): ScanKeyInput[] {
  return [
    key({
      key: 'items_one',
      sourceText: 'One item',
      tagCount: 0,
      locales: [published('en', 'One item'), published('ja', '1 個')],
    }),
    key({
      key: 'items_other',
      sourceText: '{{count}} items...',
      tagCount: 0,
      locales: [
        published('en', '{{count}} items...'),
        published('ja', 'アイテム'),
      ],
    }),
    key({
      key: 'save',
      sourceText: 'Save',
      tagCount: 1,
      locales: [published('en', 'Save'), published('fr', 'Enregistrer!')],
    }),
    key({
      key: 'save_again',
      sourceText: 'Save',
      tagCount: 0,
      locales: [published('en', 'Save')],
    }),
    key({
      key: 'hello',
      sourceText: 'Hi  {name}',
      tagCount: 1,
      locales: [published('en', 'Hi  {name}'), published('de', 'Hallo')],
    }),
  ]
}

const DIALECT = { dialect: 'i18next' as const }

function keyFindings(keys: ScanKeyInput[]) {
  return detectAll(ctx(withPluralFamilies(keys, 'en', DIALECT), DIALECT), {
    rules: keyRules,
  })
}

describe('single-key recheck', () => {
  it('splits the registry: only duplicates need the whole project', () => {
    expect(
      allRules.filter((rule) => rule.granularity === 'group').map((r) => r.id)
    ).toEqual(['duplicate-text'])
    expect(keyRules).toHaveLength(allRules.length - 1)
  })

  it('gives every key-rule finding exactly one member', () => {
    const findings = keyFindings(project())
    expect(findings.length).toBeGreaterThan(0)
    for (const finding of findings) expect(finding.keys).toHaveLength(1)
  })

  it('rechecking a key with its plural family matches the full scan', () => {
    const all = project()
    const full = keyFindings(all)
    const byName = new Map(all.map((k) => [k.key, k]))
    const targets = [
      ['items_one', 'items_other'],
      ['save'],
      ['save_again'],
      ['hello'],
    ]
    for (const names of targets) {
      const subset = names.map((name) => byName.get(name)!)
      const ids = new Set(subset.map((k) => k.keyId))
      expect(keyFindings(subset)).toEqual(
        full.filter((finding) => ids.has(finding.keys[0]!.keyId))
      )
    }
  })

  it('applies severity overrides and off like the full scan', () => {
    const findings = detectAll(
      ctx(withPluralFamilies(project(), 'en', DIALECT), {
        ...DIALECT,
        ruleSeverity: { placeholders: 'off', 'orphan-keys': 'error' },
      }),
      { rules: keyRules }
    )
    expect(findings.some((f) => f.ruleId === 'placeholders')).toBe(false)
    const orphans = findings.filter((f) => f.ruleId === 'orphan-keys')
    expect(orphans.length).toBeGreaterThan(0)
    expect(orphans.every((f) => f.severity === 'error')).toBe(true)
  })
})
