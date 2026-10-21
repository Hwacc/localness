import { describe, expect, it } from 'vitest'
import {
  EMPTY_REPORT_FILTER,
  findingIssueViews,
  findingIndex,
  findingLocales,
  fromLikeSafe,
  likeSafe,
  isReportFilterActive,
  matchesFindingIndex,
  memberBadges,
  scopeOfCategory,
  scopeSections,
  toMember,
  type ReportFilter,
  type ReportFinding,
} from '#shared/utils/consistency'

function member(key: string, sourceText: string) {
  return {
    keyId: key.length,
    key,
    sourceText,
    published: true,
    tagCount: 0,
    pages: [],
    pageCount: 0,
    sample: null,
  }
}

const numbersJa: ReportFinding = {
  ruleId: 'numbers',
  severity: 'error',
  category: 'mismatch',
  groupId: 'a',
  keys: [member('retry_title', 'Retry 3 times')],
  meta: {
    source: 'Retry 3 times',
    issues: [
      {
        locale: 'ja',
        missing: ['3'],
        extra: ['2'],
        text: '2 回再試行',
        spans: [[0, 1]],
        sourceSpans: [[6, 7]],
      },
      {
        locale: 'fr',
        missing: ['3'],
        extra: [],
        text: 'Réessayer',
        spans: [],
        sourceSpans: [[6, 7]],
      },
    ],
  },
}

const ellipsisFr: ReportFinding = {
  ruleId: 'lint.ellipsis',
  severity: 'warning',
  category: 'lint',
  groupId: 'b',
  keys: [member('loading', 'Loading…')],
  meta: {
    issues: [
      {
        locale: 'fr',
        excerpt: '...',
        text: 'Chargement...',
        spans: [[10, 13]],
      },
    ],
  },
}

const placeholdersDe: ReportFinding = {
  ruleId: 'placeholders',
  severity: 'warning',
  category: 'mismatch',
  groupId: 'c',
  keys: [member('hello', 'Hello {name}')],
  meta: {
    source: 'Hello {name}',
    issues: [
      {
        locale: 'de',
        missing: ['{name}'],
        extra: [],
        text: 'Hallo',
        spans: [],
        sourceSpans: [[6, 12]],
      },
    ],
  },
}

const duplicate: ReportFinding = {
  ruleId: 'duplicate-text',
  severity: 'error',
  category: 'duplicate',
  groupId: 'd',
  keys: [member('ok_a', 'OK'), member('ok_b', 'OK')],
  meta: { diverged: ['zh_cn'] },
}

const orphan: ReportFinding = {
  ruleId: 'orphan-keys',
  severity: 'info',
  category: 'orphan',
  groupId: 'e',
  keys: [member('unused', 'Never shown')],
}

const all = [orphan, ellipsisFr, placeholdersDe, duplicate, numbersJa]

const matches = (finding: ReportFinding, filter: ReportFilter) =>
  matchesFindingIndex(finding, findingIndex(finding), filter)

describe('report filter', () => {
  it('collects locales from issues and duplicate divergence', () => {
    expect(findingLocales(numbersJa)).toEqual(['fr', 'ja'])
    expect(findingLocales(duplicate)).toEqual(['zh_cn'])
    expect(findingLocales(orphan)).toEqual([])
  })

  it('treats the empty filter as inactive and matching everything', () => {
    expect(isReportFilterActive(EMPTY_REPORT_FILTER)).toBe(false)
    expect(all.every((f) => matches(f, EMPTY_REPORT_FILTER))).toBe(true)
  })

  it('filters by severity, rule, locale and query together', () => {
    const pick = (filter: Partial<typeof EMPTY_REPORT_FILTER>) =>
      all
        .filter((f) => matches(f, { ...EMPTY_REPORT_FILTER, ...filter }))
        .map((f) => f.groupId)

    expect(pick({ severities: ['error'] })).toEqual(['d', 'a'])
    expect(pick({ ruleIds: ['lint.ellipsis'] })).toEqual(['b'])
    // locale-agnostic findings (orphan, plain duplicate) drop out
    expect(pick({ locales: ['fr'] })).toEqual(['b', 'a'])
    expect(pick({ locales: ['zh_cn'] })).toEqual(['d'])
    // query hits key, source text and translation text, case-insensitive
    expect(pick({ query: 'RETRY' })).toEqual(['a'])
    expect(pick({ query: 'chargement' })).toEqual(['b'])
    expect(pick({ query: '  ' })).toHaveLength(all.length)
    expect(pick({ locales: ['fr'], severities: ['warning'] })).toEqual(['b'])
  })
})

describe('findingIndex', () => {
  it('orders by severity, then registry rule order, then lead key', () => {
    const index = findingIndex(numbersJa)
    expect(index.severityRank).toBe(0)
    expect(findingIndex(ellipsisFr).severityRank).toBe(1)
    expect(findingIndex(orphan).severityRank).toBe(2)
    expect(index.sortKey).toBe('retry_title')
    expect(index.ruleOrder).toBeLessThan(findingIndex(ellipsisFr).ruleOrder)
  })

  it('puts an unknown rule after every registered one', () => {
    const known = findingIndex(orphan).ruleOrder
    const unknown = findingIndex({ ...orphan, ruleId: 'gone' }).ruleOrder
    expect(unknown).toBeGreaterThan(known)
  })

  it('wraps locales in commas so one locale never matches another', () => {
    expect(findingIndex(numbersJa).locales).toBe(',fr,ja,')
    expect(findingIndex(orphan).locales).toBe('')
    const zh = { ...duplicate, meta: { diverged: ['zh'] } }
    expect(matches(zh, { ...EMPTY_REPORT_FILTER, locales: ['zh'] })).toBe(true)
    expect(matches(duplicate, { ...EMPTY_REPORT_FILTER, locales: ['zh'] })).toBe(
      false
    )
  })

  it('keeps % and _ literal for the SQL LIKE behind contains', () => {
    const index = findingIndex(duplicate)
    expect(index.searchText).not.toContain('_')
    expect(fromLikeSafe(index.locales)).toBe(',zh_cn,')
    const zhXcn = { ...duplicate, keys: [member('okXa', 'OK')], meta: { diverged: ['zh-cn'] } }
    expect(matches(zhXcn, { ...EMPTY_REPORT_FILTER, locales: ['zh_cn'] })).toBe(false)
    expect(matches(zhXcn, { ...EMPTY_REPORT_FILTER, query: 'ok_' })).toBe(false)
    expect(matches(duplicate, { ...EMPTY_REPORT_FILTER, query: 'ok_' })).toBe(true)
    expect(likeSafe('50%_off')).not.toMatch(/[%_]/)
    expect(fromLikeSafe(likeSafe('50%_off'))).toBe('50%_off')
  })

  it('searches lowercased keys, source, pending source and issue text', () => {
    const pending = {
      ...orphan,
      keys: [{ ...member('unused', 'Never shown'), pendingSourceText: 'Hidden' }],
    }
    expect(findingIndex(pending).searchText).toBe('unused\nnever shown\nhidden')
    expect(findingIndex(numbersJa).searchText).toContain('2 回再試行')
    // the separator keeps a query from matching across two parts
    expect(matches(pending, { ...EMPTY_REPORT_FILTER, query: 'shown hidden' })).toBe(
      false
    )
  })
})

describe('findingIssueViews', () => {
  it('describes and highlights each issue, narrowed by locale', () => {
    const views = findingIssueViews(numbersJa)
    expect(views.map((v) => v.locale)).toEqual(['ja', 'fr'])
    expect(views[0]!.segments).toEqual([
      { text: '2', hit: true },
      { text: ' 回再試行', hit: false },
    ])
    expect(views[0]!.sourceSegments?.some((s) => s.hit && s.text === '3')).toBe(
      true
    )
    expect(findingIssueViews(numbersJa, ['fr']).map((v) => v.locale)).toEqual([
      'fr',
    ])
    const [lint] = findingIssueViews(ellipsisFr)
    expect(lint!.sourceSegments).toBeNull()
    expect(lint!.message).toContain('…')
    expect(findingIssueViews(orphan)).toEqual([])
  })
})

describe('memberBadges', () => {
  const labels = (input: Parameters<typeof memberBadges>[0]) =>
    memberBadges(input).map((badge) => badge.label)

  it('says nothing about a published key without pending edits', () => {
    expect(labels({ key: 'save', published: true })).toEqual([])
  })

  it('names an auto-generated key by what it is, not "draft"', () => {
    expect(labels({ key: '__draft_ab12', published: false })).toEqual(['Auto key'])
  })

  it('flags a never-published formal key and a pending source edit', () => {
    expect(labels({ key: 'save', published: false })).toEqual(['Unpublished'])
    expect(
      labels({ key: 'save', published: true, pendingSourceText: 'Save file' })
    ).toEqual(['Pending edit'])
  })

  it('derives published from any locale having published text', () => {
    const base = { keyId: 1, key: 'k', tagCount: 0, sourceText: 'Hi' }
    expect(
      toMember({ ...base, locales: [{ locale: 'en', draftText: 'Hi', publishedText: null }] })
        .published
    ).toBe(false)
    expect(
      toMember({ ...base, locales: [{ locale: 'ja', draftText: 'やあ', publishedText: 'やあ' }] })
        .published
    ).toBe(true)
  })
})

describe('scopeSections', () => {
  it('places every category under exactly one scope', () => {
    const all = scopeSections.flatMap((scope) => scope.categories)
    expect([...all].sort()).toEqual(['duplicate', 'lint', 'mismatch', 'orphan'])
    expect(new Set(all).size).toBe(all.length)
  })

  it('looks up each category scope', () => {
    expect(scopeOfCategory('duplicate').id).toBe('dictionary')
    expect(scopeOfCategory('orphan').id).toBe('dictionary')
    expect(scopeOfCategory('mismatch').id).toBe('published')
    expect(scopeOfCategory('lint').id).toBe('published')
  })
})
