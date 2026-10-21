import type {
  ConsistencyFinding,
  ConsistencyRule,
  FindingCategory,
  RuleProgress,
  ScanContext,
} from '../types'
import { duplicateTextRule } from './duplicate-text'
import { placeholdersRule } from './placeholders'
import { numbersRule } from './numbers'
import { urlsEmailsRule } from './urls-emails'
import { htmlTagsRule } from './html-tags'
import { orphanKeysRule } from './orphan-keys'
import { lintEllipsisRule } from './lint-ellipsis'
import { lintDoubleSpaceRule } from './lint-double-space'
import { lintCjkSpacingRule } from './lint-cjk-spacing'
import { lintTerminalPunctRule } from './lint-terminal-punct'
import { lintFrenchSpacingRule } from './lint-french-spacing'

/** Registry order = report order. Adding a rule is one entry here. */
export const allRules: ConsistencyRule[] = [
  duplicateTextRule,
  placeholdersRule,
  numbersRule,
  urlsEmailsRule,
  htmlTagsRule,
  orphanKeysRule,
  lintEllipsisRule,
  lintDoubleSpaceRule,
  lintCjkSpacingRule,
  lintTerminalPunctRule,
  lintFrenchSpacingRule,
]

/** The rules a single-key recheck can redo — see `ConsistencyRule.granularity`. */
export const keyRules = allRules.filter((rule) => rule.granularity === 'key')

/** Presentation labels for the lint switches in project settings. */
export const lintRuleCatalog: Array<{ id: string; label: string }> = [
  { id: 'lint.ellipsis', label: 'Ellipsis ("..." → "…")' },
  { id: 'lint.double-space', label: 'Double space' },
  { id: 'lint.cjk-spacing', label: 'CJK spacing' },
  { id: 'lint.terminal-punct', label: 'Terminal punctuation' },
  { id: 'lint.french-spacing', label: 'French spacing' },
]

/** Rules a project may re-grade or turn off (Project Settings → Consistency). */
export const severityRuleCatalog: Array<{
  id: string
  label: string
  description: string
}> = [
  {
    id: 'numbers',
    label: 'Numbers',
    description:
      'Digits a translation drops or changes. Dates and ordinals are often written differently per language — lower it if that is noise.',
  },
]

export const categorySections: Record<
  FindingCategory,
  { title: string; description: string }
> = {
  duplicate: {
    title: 'Duplicate text',
    description:
      'The same source sentence saved under different keys, across every captured design.',
  },
  mismatch: {
    title: 'Source ↔ translation',
    description:
      'Published translations whose placeholders, numbers, URLs or tags disagree with the source — what users see break.',
  },
  lint: {
    title: 'Lint',
    description:
      'Style suggestions for published copy: ellipsis, spacing, terminal punctuation.',
  },
  orphan: {
    title: 'Orphan keys',
    description:
      'Dictionary entries no frame references — leftovers from deleted designs or manual creation.',
  },
}

/**
 * The two questions the report answers, each over its own text (2026-10-20):
 * dictionary structure looks at every key, drafts and `__draft_` auto keys
 * included; published copy looks only at what users see. The page marks each
 * category header with its scope (icon + tooltip) so the scope is never
 * implicit.
 */
export const scopeSections: Array<{
  id: 'dictionary' | 'published'
  title: string
  description: string
  categories: FindingCategory[]
}> = [
  {
    id: 'dictionary',
    title: 'Every key',
    description:
      'Checks every key, published or not — auto keys included. Compares the published source, or the draft if the key was never published.',
    categories: ['duplicate', 'orphan'],
  },
  {
    id: 'published',
    title: 'Published only',
    description:
      'Checks only published text — what users see. Unpublished drafts are not checked.',
    categories: ['mismatch', 'lint'],
  },
]

export function scopeOfCategory(category: FindingCategory) {
  const scope = scopeSections.find((candidate) =>
    candidate.categories.includes(category)
  )
  if (!scope) throw new Error(`No scope for category ${category}`)
  return scope
}

/**
 * The rules' findings, graded by the project's severity overrides — every
 * rule unless `rules` narrows it (the single-key recheck passes `key` rules).
 * `onRule` reports after each rule — the background scan's bar and its log.
 */
export function detectAll(
  ctx: ScanContext,
  {
    rules = allRules,
    onRule,
  }: {
    rules?: ConsistencyRule[]
    onRule?: (progress: RuleProgress) => void
  } = {}
): ConsistencyFinding[] {
  return rules.flatMap((rule, index) => {
    const severity = ctx.ruleSeverity[rule.id]
    const startedAt = performance.now()
    const findings = severity === 'off' ? [] : rule.detect(ctx)
    onRule?.({
      done: index + 1,
      total: rules.length,
      ruleId: rule.id,
      findings: findings.length,
      ms: performance.now() - startedAt,
      off: severity === 'off',
    })
    return severity && severity !== 'off'
      ? findings.map((finding) => ({ ...finding, severity }))
      : findings
  })
}
