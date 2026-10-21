export type {
  ConsistencyFinding,
  ConsistencyMember,
  ConsistencyRule,
  FindingCategory,
  FindingSeverity,
  LintIssue,
  MismatchIssue,
  ScanContext,
  ScanKeyInput,
  ScanKeyLocale,
  RuleProgress,
  ScanPhase,
  ScanSettings,
  ScanStatus,
  TextSpan,
} from './types'
export {
  DEFAULT_I18N_DIALECT,
  dialectSyntax,
  i18nDialectItems,
  I18N_DIALECTS,
  parseI18nDialect,
  RULE_SEVERITY_VALUES,
  ruleSeverityItems,
  type DialectSyntax,
  type I18nDialect,
  type RuleSeverity,
} from './dialect'
export {
  describeLint,
  describeMismatch,
  highlightSegments,
  ruleCopy,
} from './explain'
export {
  EMPTY_REPORT_FILTER,
  findingIssueViews,
  findingKey,
  findingLocales,
  groupReport,
  isReportFilterActive,
  matchesReportFilter,
  memberBadges,
  severityCounts,
  worstSeverity,
  type HighlightSegment,
  type IssueView,
  type MemberBadge,
  type ReportCategoryGroup,
  type ReportFilter,
  type ReportFinding,
  type ReportMember,
  type ReportRuleGroup,
} from './report-view'
export { DEFAULT_SCAN_SETTINGS, toMember } from './types'
export {
  normalizeConsistencyText,
  normalizeExact,
  publishedWording,
  publishedWritings,
  scanSourceText,
} from './text'
export { publishedSnapshotText, singleKeyGroupId } from './group-id'
export {
  pluralBase,
  pluralSiblingNames,
  withPluralFamilies,
  type PluralFamily,
} from './plural'
export { partitionIgnored, type IgnoreRow } from './ignore'
export {
  autoFix,
  isPublishedKey,
  lintAutoFix,
  mergeBlockReason,
  mismatchAutoFix,
  outdatedOnSourceSave,
  planLocaleChoices,
  recheckLocale,
  resolveMergeWrites,
  suggestKeeper,
  type FingerprintedLocale,
  type LocaleChoice,
  type MergeCandidate,
} from './resolve'
export {
  allRules,
  categorySections,
  detectAll,
  keyRules,
  lintRuleCatalog,
  scopeSections,
  scopeOfCategory,
  severityRuleCatalog,
} from './rules'
