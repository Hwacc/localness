import { describe, expect, it } from 'vitest'
import {
  EMPTY_REPORT_FILTER,
  findingIssueViews,
  findingLocales,
  groupReport,
  isReportFilterActive,
  matchesReportFilter,
  severityCounts,
  worstSeverity,
  type ReportFinding,
} from '#shared/utils/consistency'

function member(key: string, sourceText: string) {
  return {
    keyId: key.length,
    key,
    sourceText,
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

describe('report filter', () => {
  it('collects locales from issues and duplicate divergence', () => {
    expect(findingLocales(numbersJa)).toEqual(['fr', 'ja'])
    expect(findingLocales(duplicate)).toEqual(['zh_cn'])
    expect(findingLocales(orphan)).toEqual([])
  })

  it('treats the empty filter as inactive and matching everything', () => {
    expect(isReportFilterActive(EMPTY_REPORT_FILTER)).toBe(false)
    expect(all.every((f) => matchesReportFilter(f, EMPTY_REPORT_FILTER))).toBe(
      true
    )
  })

  it('filters by severity, rule, locale and query together', () => {
    const pick = (filter: Partial<typeof EMPTY_REPORT_FILTER>) =>
      all
        .filter((f) =>
          matchesReportFilter(f, { ...EMPTY_REPORT_FILTER, ...filter })
        )
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

describe('groupReport', () => {
  it('groups category → rule in registry order and drops empty categories', () => {
    const groups = groupReport(all, ['duplicate', 'mismatch', 'lint', 'orphan'])
    expect(groups.map((g) => g.category)).toEqual([
      'duplicate',
      'mismatch',
      'lint',
      'orphan',
    ])
    // numbers (error) outranks placeholders (warning) despite registry order
    expect(groups[1]!.rules.map((r) => r.ruleId)).toEqual([
      'numbers',
      'placeholders',
    ])
    expect(groups[1]!.findings.map((f) => f.groupId)).toEqual(['a', 'c'])
    expect(groupReport([orphan], ['duplicate', 'orphan'])).toHaveLength(1)
  })

  it('sorts findings inside a rule by severity, then key', () => {
    const late = { ...placeholdersDe, groupId: 'z', severity: 'error' as const }
    const [group] = groupReport([placeholdersDe, late], ['mismatch'])
    expect(group!.rules[0]!.findings.map((f) => f.groupId)).toEqual(['z', 'c'])
  })

  it('counts severities and finds the worst', () => {
    expect(severityCounts(all)).toEqual({ error: 2, warning: 2, info: 1 })
    expect(worstSeverity([orphan, ellipsisFr])).toBe('warning')
    expect(worstSeverity([orphan])).toBe('info')
    expect(worstSeverity([])).toBeNull()
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
