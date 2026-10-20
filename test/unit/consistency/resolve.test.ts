import { describe, expect, it } from 'vitest'
import {
  DEFAULT_SCAN_SETTINGS,
  lintAutoFix,
  mergeBlockReason,
  outdatedOnSourceSave,
  planLocaleChoices,
  recheckLocale,
  resolveMergeWrites,
  suggestKeeper,
  type MergeCandidate,
} from '#shared/utils/consistency'
import { fpTranslation } from '#shared/utils'
import { key, published } from './helpers'

const draft = (locale: string, text: string) => ({
  locale,
  draftText: text,
  publishedText: null,
})

function candidate(overrides: Partial<MergeCandidate>): MergeCandidate {
  return {
    keyId: 1,
    key: 'k',
    tagCount: 0,
    createdAt: '2026-01-01T00:00:00.000Z',
    locales: [],
    ...overrides,
  }
}

describe('suggestKeeper', () => {
  it('prefers a published key over one with more tags', () => {
    const result = suggestKeeper([
      candidate({ keyId: 1, tagCount: 9, locales: [draft('en', 'Save')] }),
      candidate({ keyId: 2, tagCount: 1, locales: [published('en', 'Save')] }),
    ])
    expect(result).toEqual({
      keyId: 2,
      reasons: ['published', 'named key', '1 tag', '1 language'],
    })
  })

  it('prefers a named key over a draft placeholder, then tags, then age', () => {
    expect(
      suggestKeeper([
        candidate({ keyId: 1, key: '__draft_a', tagCount: 5 }),
        candidate({ keyId: 2, key: 'save', tagCount: 1 }),
      ])?.keyId
    ).toBe(2)
    expect(
      suggestKeeper([
        candidate({ keyId: 1, tagCount: 1 }),
        candidate({ keyId: 2, tagCount: 3 }),
      ])?.keyId
    ).toBe(2)
    expect(
      suggestKeeper([
        candidate({ keyId: 1, createdAt: '2026-02-01T00:00:00.000Z' }),
        candidate({ keyId: 2, createdAt: '2026-01-01T00:00:00.000Z' }),
      ])?.keyId
    ).toBe(2)
  })

  it('returns null for no candidates', () => {
    expect(suggestKeeper([])).toBeNull()
  })
})

describe('mergeBlockReason', () => {
  it('blocks a key published in any locale', () => {
    expect(mergeBlockReason(candidate({ locales: [published('ja', 'x')] }))).toBe(
      'published'
    )
    expect(mergeBlockReason(candidate({ locales: [draft('ja', 'x')] }))).toBeNull()
  })
})

describe('planLocaleChoices / resolveMergeWrites', () => {
  const keeper = candidate({
    keyId: 1,
    locales: [draft('en', 'Save'), draft('ja', '保存')],
  })
  const other = candidate({
    keyId: 2,
    locales: [draft('en', 'Save'), draft('ja', 'セーブ'), draft('fr', 'Enregistrer')],
  })
  const same = candidate({
    keyId: 3,
    locales: [draft('en', 'Save'), draft('ja', '保存')],
  })

  it('fills missing locales, flags conflicts, skips the source locale', () => {
    const plan = planLocaleChoices(keeper, [other, same], 'en')
    expect(plan).toEqual([
      {
        locale: 'fr',
        status: 'fill',
        options: [{ text: 'Enregistrer', keyIds: [2] }],
        defaultKeyId: 2,
      },
      {
        locale: 'ja',
        status: 'conflict',
        options: [
          { text: '保存', keyIds: [1, 3] },
          { text: 'セーブ', keyIds: [2] },
        ],
        defaultKeyId: 1,
      },
    ])
  })

  it('omits locales where everyone agrees', () => {
    expect(planLocaleChoices(keeper, [same], 'en')).toEqual([])
  })

  it('writes only texts that differ from the keeper', () => {
    expect(resolveMergeWrites(keeper, [other], 'en', {})).toEqual({
      fr: 'Enregistrer',
    })
    expect(resolveMergeWrites(keeper, [other], 'en', { ja: 2 })).toEqual({
      fr: 'Enregistrer',
      ja: 'セーブ',
    })
  })

  it('rejects a pick that is not an offered option', () => {
    expect(() => resolveMergeWrites(keeper, [other], 'en', { ja: 99 })).toThrow(
      /Invalid pick for ja/
    )
  })
})

describe('lintAutoFix', () => {
  it.each([
    ['lint.ellipsis', 'Loading....', 'Loading…'],
    ['lint.double-space', 'a  b   c', 'a b c'],
    ['lint.french-spacing', 'Bonjour !', 'Bonjour\u202f!'],
    ['lint.cjk-spacing', '使用Wi-Fi连接3次', '使用 Wi-Fi 连接 3 次'],
  ])('%s rewrites %j', (ruleId, input, output) => {
    expect(lintAutoFix(ruleId, input)).toBe(output)
  })

  it('returns null when there is no deterministic fix or nothing changes', () => {
    expect(lintAutoFix('lint.terminal-punct', 'Hello')).toBeNull()
    expect(lintAutoFix('lint.ellipsis', 'Loading…')).toBeNull()
  })
})

describe('recheckLocale', () => {
  const k = key({
    sourceText: 'You have {count} items',
    locales: [
      published('en', 'You have {count} items'),
      published('ja', '項目があります'),
    ],
  })

  it('returns the issue while the edit still fails', () => {
    expect(
      recheckLocale('placeholders', k, 'en', 'ja', '項目があります')
    ).toMatchObject({ locale: 'ja', missing: ['{count}'] })
  })

  it('returns null once the edit passes', () => {
    expect(
      recheckLocale('placeholders', k, 'en', 'ja', '{count} 件の項目があります')
    ).toBeNull()
  })

  it('checks lint rules against the edited text', () => {
    const lintKey = key({ locales: [published('en', 'Wait...')] })
    expect(recheckLocale('lint.ellipsis', lintKey, 'en', 'en', 'Wait...')).toMatchObject({
      locale: 'en',
    })
    expect(recheckLocale('lint.ellipsis', lintKey, 'en', 'en', 'Wait…')).toBeNull()
  })

  it('stays silent for a rule the project has turned off', () => {
    const lintKey = key({ locales: [published('en', 'Wait...')] })
    expect(
      recheckLocale('lint.ellipsis', lintKey, 'en', 'en', 'Wait...', {
        ...DEFAULT_SCAN_SETTINGS,
        lintRules: { 'lint.ellipsis': false },
      })
    ).toBeNull()
  })

  it('keeps mismatch rules indifferent to lint switches', () => {
    expect(
      recheckLocale('placeholders', k, 'en', 'ja', '項目があります', {
        ...DEFAULT_SCAN_SETTINGS,
        lintRules: { 'lint.ellipsis': false },
      })
    ).toMatchObject({ locale: 'ja' })
  })
})

describe('outdatedOnSourceSave', () => {
  const fp = fpTranslation('Save file')
  const row = (locale: string, text: string | null, sourceFingerprint = fp) => ({
    locale,
    draftText: text,
    publishedText: text,
    sourceFingerprint,
  })
  const base = {
    sourceLocale: 'en',
    fingerprint: fp,
    locales: [row('en', 'Save file', ''), row('de', 'Datei speichern'), row('ja', null)],
  }

  it('counts up-to-date translations with text when the wording changes', () => {
    expect(outdatedOnSourceSave({ ...base, text: 'Save the file' })).toBe(1)
  })

  it('stays silent for a whitespace-only edit', () => {
    expect(outdatedOnSourceSave({ ...base, text: 'Save  file ' })).toBe(0)
  })

  it('skips translations that are already outdated', () => {
    expect(
      outdatedOnSourceSave({
        ...base,
        locales: [...base.locales, row('fr', 'Enregistrer', 'old')],
        text: 'Save the file',
      })
    ).toBe(1)
  })

  it('stays silent while the key remains a draft', () => {
    expect(
      outdatedOnSourceSave({
        ...base,
        locales: [
          ...base.locales,
          { locale: 'fr', draftText: 'Enregistrer', publishedText: null, sourceFingerprint: fp },
        ],
        text: 'Save the file',
      })
    ).toBe(0)
  })
})
