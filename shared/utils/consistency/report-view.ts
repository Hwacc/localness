import { DRAFT_KEY_PREFIX } from '../index'
import {
  describeLint,
  describeMismatch,
  highlightSegments,
  ruleCopy,
} from './explain'
import type {
  FindingCategory,
  FindingSeverity,
  LintIssue,
  MismatchIssue,
} from './types'

/** One key as the report endpoint returns it (enriched with page context). */
export type ReportMember = {
  keyId: number
  key: string
  sourceText: string
  pendingSourceText?: string
  published: boolean
  tagCount: number
  pages: string[]
  pageCount: number
  /** A stable representative tag for the editor deep link; null when unbound. */
  sample: { pageId: number; tagId: number } | null
}

export type ReportFinding = {
  ruleId: string
  severity: FindingSeverity
  category: FindingCategory
  groupId: string
  keys: ReportMember[]
  meta?: Record<string, unknown>
}

/** Empty arrays / blank query mean "no restriction on that axis". */
export type ReportFilter = {
  severities: FindingSeverity[]
  locales: string[]
  ruleIds: string[]
  query: string
}

export const EMPTY_REPORT_FILTER: ReportFilter = {
  severities: [],
  locales: [],
  ruleIds: [],
  query: '',
}

const SEVERITY_RANK: Record<FindingSeverity, number> = {
  error: 0,
  warning: 1,
  info: 2,
}

const RULE_ORDER = Object.keys(ruleCopy)

export function findingKey(finding: Pick<ReportFinding, 'ruleId' | 'groupId'>) {
  return `${finding.ruleId} ${finding.groupId}`
}

function rawIssues(finding: ReportFinding): Array<MismatchIssue | LintIssue> {
  const issues = finding.meta?.issues
  return Array.isArray(issues) ? (issues as Array<MismatchIssue | LintIssue>) : []
}

/** Locales a finding is about: issue rows, or the diverged set of a duplicate. */
export function findingLocales(finding: ReportFinding): string[] {
  const out = new Set(rawIssues(finding).map((issue) => issue.locale))
  const diverged = finding.meta?.diverged
  if (Array.isArray(diverged)) for (const locale of diverged) out.add(String(locale))
  return [...out].sort()
}

export function isReportFilterActive(filter: ReportFilter): boolean {
  return (
    filter.severities.length > 0 ||
    filter.locales.length > 0 ||
    filter.ruleIds.length > 0 ||
    filter.query.trim() !== ''
  )
}

/**
 * A locale filter keeps only findings that involve one of those locales, so
 * locale-agnostic findings (plain duplicates, orphans) drop out — "show me ja"
 * means ja work.
 */
export function matchesReportFilter(
  finding: ReportFinding,
  filter: ReportFilter
): boolean {
  if (filter.severities.length && !filter.severities.includes(finding.severity))
    return false
  if (filter.ruleIds.length && !filter.ruleIds.includes(finding.ruleId))
    return false
  if (
    filter.locales.length &&
    !findingLocales(finding).some((locale) => filter.locales.includes(locale))
  )
    return false
  const query = filter.query.trim().toLowerCase()
  if (!query) return true
  const haystack = [
    ...finding.keys.flatMap((member) => [
      member.key,
      member.sourceText,
      member.pendingSourceText ?? '',
    ]),
    ...rawIssues(finding).map((issue) => issue.text),
  ]
  return haystack.some((text) => text.toLowerCase().includes(query))
}

export type ReportRuleGroup = { ruleId: string; findings: ReportFinding[] }
export type ReportCategoryGroup = {
  category: FindingCategory
  findings: ReportFinding[]
  rules: ReportRuleGroup[]
}

function bySeverityThenKey(a: ReportFinding, b: ReportFinding) {
  return (
    SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity] ||
    (a.keys[0]?.key ?? '').localeCompare(b.keys[0]?.key ?? '')
  )
}

function worstRank(findings: ReportFinding[]) {
  return Math.min(...findings.map((f) => SEVERITY_RANK[f.severity]))
}

/**
 * Category → rule → findings. Rules sort by their worst finding, then by
 * registry order; findings by severity, then key. Empty categories are dropped.
 */
export function groupReport(
  findings: ReportFinding[],
  categoryOrder: FindingCategory[]
): ReportCategoryGroup[] {
  const out: ReportCategoryGroup[] = []
  for (const category of categoryOrder) {
    const inCategory = findings.filter((f) => f.category === category)
    if (!inCategory.length) continue
    const byRule = new Map<string, ReportFinding[]>()
    for (const finding of inCategory) {
      const list = byRule.get(finding.ruleId) ?? []
      list.push(finding)
      byRule.set(finding.ruleId, list)
    }
    const rules = [...byRule]
      .map(([ruleId, list]) => ({
        ruleId,
        findings: [...list].sort(bySeverityThenKey),
      }))
      .sort(
        (a, b) =>
          worstRank(a.findings) - worstRank(b.findings) ||
          RULE_ORDER.indexOf(a.ruleId) - RULE_ORDER.indexOf(b.ruleId)
      )
    out.push({
      category,
      findings: rules.flatMap((rule) => rule.findings),
      rules,
    })
  }
  return out
}

export function severityCounts(
  findings: ReportFinding[]
): Record<FindingSeverity, number> {
  const counts: Record<FindingSeverity, number> = { error: 0, warning: 0, info: 0 }
  for (const finding of findings) counts[finding.severity] += 1
  return counts
}

export function worstSeverity(findings: ReportFinding[]): FindingSeverity | null {
  if (!findings.length) return null
  const rank = worstRank(findings)
  return (Object.keys(SEVERITY_RANK) as FindingSeverity[]).find(
    (severity) => SEVERITY_RANK[severity] === rank
  )!
}

export type HighlightSegment = { text: string; hit: boolean }

export type IssueView = {
  locale: string
  message: string
  segments: HighlightSegment[]
  /** Mismatch only: the published source with the missing tokens marked. */
  sourceSegments: HighlightSegment[] | null
  /** The plural sibling the source came from (`items_other`), if not the key. */
  sourceKey: string | null
}

/** Issue rows ready to render; `locales` (when non-empty) narrows the rows. */
export function findingIssueViews(
  finding: ReportFinding,
  locales: string[] = []
): IssueView[] {
  const issues = rawIssues(finding).filter(
    (issue) => !locales.length || locales.includes(issue.locale)
  )
  if (finding.category === 'mismatch') {
    const source = String(finding.meta?.source ?? '')
    const sourceKey =
      typeof finding.meta?.sourceKey === 'string' ? finding.meta.sourceKey : null
    return (issues as MismatchIssue[]).map((issue) => ({
      locale: issue.locale,
      message: describeMismatch(finding.ruleId, issue),
      segments: highlightSegments(issue.text, issue.spans),
      sourceSegments: issue.sourceSpans.length
        ? highlightSegments(source, issue.sourceSpans)
        : null,
      sourceKey,
    }))
  }
  return (issues as LintIssue[]).map((issue) => ({
    locale: issue.locale,
    message: describeLint(finding.ruleId, issue, finding.meta),
    segments: highlightSegments(issue.text, issue.spans),
    sourceSegments: null,
    sourceKey: null,
  }))
}

export type MemberBadge = {
  label: 'Auto key' | 'Unpublished' | 'Pending edit'
  color: 'neutral' | 'warning' | 'info'
  title: string
}

/**
 * What state a key is in, spelled out — never the bare word "draft", which
 * read as "unpublished" while meaning the `__draft_` name. A published key with
 * no pending edit gets no badge.
 */
export function memberBadges(member: {
  key: string
  published: boolean
  pendingSourceText?: string
}): MemberBadge[] {
  const badges: MemberBadge[] = []
  if (member.key.startsWith(DRAFT_KEY_PREFIX)) {
    badges.push({
      label: 'Auto key',
      color: 'neutral',
      title: 'Generated automatically (__draft_…) for a frame that had no key name. Rename it to a real key before shipping.',
    })
  } else if (!member.published) {
    badges.push({
      label: 'Unpublished',
      color: 'warning',
      title: 'Never published — code and the delivery API do not serve this key yet.',
    })
  }
  if (member.pendingSourceText) {
    badges.push({
      label: 'Pending edit',
      color: 'info',
      title: 'The source has an unpublished edit. Checks use the published text until it is published.',
    })
  }
  return badges
}

