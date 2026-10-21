import type { I18nDialect, RuleSeverity } from './dialect'
import type { PluralFamily } from './plural'

/**
 * Rule registry types for the consistency report. A finding is the unit the
 * page renders and the whitelist keys — one rule may produce group findings
 * (n≥2, duplicates) or single-key findings (n=1, mismatch/lint/orphan), and
 * the whitelist treats both the same way.
 */

export type FindingSeverity = 'error' | 'warning' | 'info'

export type FindingCategory = 'duplicate' | 'mismatch' | 'lint' | 'orphan'

/** `[start, end)` offsets into the text an issue quotes, for highlighting. */
export type TextSpan = [number, number]

/** `meta.issues[]` of a mismatch finding: one row per offending locale. */
export interface MismatchIssue {
  locale: string
  /** Source tokens this translation lacks / tokens it adds — raw, as written. */
  missing: string[]
  extra: string[]
  /** The published translation, with `spans` marking the extra tokens. */
  text: string
  spans: TextSpan[]
  /** Where the missing tokens sit in the published source (`meta.source`). */
  sourceSpans: TextSpan[]
}

/** `meta.issues[]` of a lint finding: one row per offending locale. */
export interface LintIssue {
  locale: string
  excerpt: string
  text: string
  spans: TextSpan[]
}

export interface ConsistencyMember {
  keyId: number
  key: string
  sourceText: string
  /** Unpublished source edit on top of `sourceText`; display only. */
  pendingSourceText?: string
  /** Any locale has published text — code or the delivery API may read it. */
  published: boolean
  tagCount: number
}

export interface ConsistencyFinding {
  ruleId: string
  severity: FindingSeverity
  category: FindingCategory
  /**
   * Opaque whitelist id. Group rules use the normalized-text hash; single-key
   * rules embed the key id and a text hash so an edit invalidates the id
   * (R3: a whitelist row can never permanently bury a changed finding).
   */
  groupId: string
  keys: ConsistencyMember[]
  meta?: Record<string, unknown>
}

export interface ScanKeyLocale {
  locale: string
  draftText: string | null
  publishedText: string | null
}

export interface ScanKeyInput {
  keyId: number
  key: string
  tagCount: number
  /**
   * The key's live source wording (`scanSourceText`): published source, or
   * the draft for a never-published key. Duplicates group on it.
   */
  sourceText: string
  /** An unpublished source edit on top of `sourceText`; display only. */
  pendingSourceText?: string
  locales: ScanKeyLocale[]
  /** i18next plural siblings (`withPluralFamilies`); absent for plain keys. */
  pluralFamily?: PluralFamily
}

/** The project's Consistency settings — what a scan and a recheck both obey. */
export interface ScanSettings {
  /** Lint rule switches; an absent entry means enabled (default-on). */
  lintRules: Record<string, boolean>
  dialect: I18nDialect
  /** Per-rule severity override; absent = the rule's default. */
  ruleSeverity: Record<string, RuleSeverity>
}

export const DEFAULT_SCAN_SETTINGS: ScanSettings = {
  lintRules: {},
  dialect: 'auto',
  ruleSeverity: {},
}

export interface ScanContext extends ScanSettings {
  projectId: number
  sourceLocale: string
  keys: ScanKeyInput[]
}

/** A background scan's step: read the project, run the rules, save rows. */
export type ScanPhase = 'loading' | 'checking' | 'saving'

/** One rule finished — `detectAll`'s `onRule` payload. */
export interface RuleProgress {
  /** Rules finished so far / rules in this pass. */
  done: number
  total: number
  ruleId: string
  /** Findings this rule produced (0 when `off`). */
  findings: number
  ms: number
  off: boolean
}

/**
 * A project's background scan as the report sees it. Lives in server memory
 * only; `failed` keeps the last error until the next start.
 */
export type ScanStatus =
  | { state: 'idle' }
  | {
      state: 'running'
      phase: ScanPhase
      /** Rules finished / rule count during `checking`; 0/0 otherwise. */
      done: number
      total: number
      startedAt: string
    }
  | { state: 'failed'; error: string; finishedAt: string }

export interface ConsistencyRule {
  id: string
  defaultSeverity: FindingSeverity
  category: FindingCategory
  /**
   * `key`: each finding is about one key and depends only on that key (and
   * its i18next plural family), so a single-key recheck can redo it right
   * after an edit. `group`: findings compare keys across the project
   * (duplicates) and only a full scan can rebuild them.
   */
  granularity: 'key' | 'group'
  detect(ctx: ScanContext): ConsistencyFinding[]
}

export function toMember(key: ScanKeyInput): ConsistencyMember {
  return {
    keyId: key.keyId,
    key: key.key,
    sourceText: key.sourceText,
    ...(key.pendingSourceText ? { pendingSourceText: key.pendingSourceText } : {}),
    published: key.locales.some((row) => (row.publishedText ?? '') !== ''),
    tagCount: key.tagCount,
  }
}
