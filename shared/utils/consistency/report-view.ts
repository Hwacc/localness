import { DRAFT_KEY_PREFIX } from '../index'
import {
  describeLint,
  describeMismatch,
  highlightSegments,
} from './explain'
import { allRules } from './rules'
import type {
  ConsistencyFinding,
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

/** Category order on the page; also the registry's category order. */
export const CATEGORY_ORDER: FindingCategory[] = [
  'duplicate',
  'mismatch',
  'lint',
  'orphan',
]

export const SEVERITY_ORDER: FindingSeverity[] = ['error', 'warning', 'info']

/** Rows per category on first load and per "Show more". */
export const REPORT_PAGE_SIZE = 20

/** Most rows one request returns (a reload keeps what was already shown). */
export const REPORT_PAGE_MAX = 200

export function findingKey(finding: Pick<ReportFinding, 'ruleId' | 'groupId'>) {
  return `${finding.ruleId} ${finding.groupId}`
}

type IndexableFinding = Pick<
  ConsistencyFinding,
  'ruleId' | 'severity' | 'keys' | 'meta'
>

function rawIssues(
  finding: Pick<ConsistencyFinding, 'meta'>
): Array<MismatchIssue | LintIssue> {
  const issues = finding.meta?.issues
  return Array.isArray(issues) ? (issues as Array<MismatchIssue | LintIssue>) : []
}

/** Locales a finding is about: issue rows, or the diverged set of a duplicate. */
export function findingLocales(finding: Pick<ConsistencyFinding, 'meta'>): string[] {
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
 * What the snapshot stores next to each finding so the server can filter,
 * count and page in SQL: order fields, locales as `,ja,fr,` (so `,ja,` is an
 * exact containment test) and a lowercased search haystack.
 */
export type FindingIndex = {
  severityRank: number
  ruleOrder: number
  sortKey: string
  locales: string
  searchText: string
}

/**
 * Prisma's `contains` on SQLite is a bare LIKE: `%` and `_` stay wildcards.
 * The stored `locales` / `searchText` and every pattern matched against them
 * go through this, which maps both to private-use characters — then LIKE
 * compares them literally. `fromLikeSafe` undoes it for display.
 */
const LIKE_WILDCARDS: Array<[string, string]> = [
  ['%', '\uE000'],
  ['_', '\uE001'],
]

export function likeSafe(text: string): string {
  return LIKE_WILDCARDS.reduce((out, [raw, safe]) => out.replaceAll(raw, safe), text)
}

export function fromLikeSafe(text: string): string {
  return LIKE_WILDCARDS.reduce((out, [raw, safe]) => out.replaceAll(safe, raw), text)
}

/** Joins the haystack parts; a search box cannot type it, so no match spans two. */
const SEARCH_SEPARATOR = '\n'

export function findingIndex(finding: IndexableFinding): FindingIndex {
  const locales = findingLocales(finding)
  const ruleOrder = allRules.findIndex((rule) => rule.id === finding.ruleId)
  return {
    severityRank: SEVERITY_ORDER.indexOf(finding.severity),
    ruleOrder: ruleOrder === -1 ? allRules.length : ruleOrder,
    sortKey: finding.keys[0]?.key ?? '',
    locales: locales.length ? likeSafe(`,${locales.join(',')},`) : '',
    searchText: likeSafe([
      ...finding.keys.flatMap((member) => [
        member.key,
        member.sourceText,
        member.pendingSourceText ?? '',
      ]),
      ...rawIssues(finding).map((issue) => issue.text),
    ]
      .filter(Boolean)
      .join(SEARCH_SEPARATOR)
      .toLowerCase()),
  }
}

/**
 * The report filter over a stored index — the exact predicate the server's
 * query builds, kept here so tests pin its meaning. A locale filter keeps only
 * findings that involve one of those locales, so locale-agnostic findings
 * (plain duplicates, orphans) drop out — "show me ja" means ja work.
 */
export function matchesFindingIndex(
  finding: Pick<ConsistencyFinding, 'ruleId' | 'severity'>,
  index: FindingIndex,
  filter: ReportFilter
): boolean {
  if (filter.severities.length && !filter.severities.includes(finding.severity))
    return false
  if (filter.ruleIds.length && !filter.ruleIds.includes(finding.ruleId))
    return false
  if (
    filter.locales.length &&
    !filter.locales.some((locale) => index.locales.includes(localePattern(locale)))
  )
    return false
  const query = reportQueryNeedle(filter.query)
  return !query || index.searchText.includes(likeSafe(query))
}

/** The search box text as matched against `searchText`; '' = no search. */
export function reportQueryNeedle(query: string): string {
  return query.trim().toLowerCase()
}

/** What a locale filter looks for in the stored `locales`. */
export function localePattern(locale: string): string {
  return likeSafe(`,${locale},`)
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

