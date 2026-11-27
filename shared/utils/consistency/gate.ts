import { describeMismatch } from './explain'
import { mismatchAutoFix, recheckLocale } from './resolve'
import { DEFAULT_SCAN_SETTINGS } from './types'
import type { MismatchIssue, ScanKeyInput, ScanSettings } from './types'

/**
 * The token rules a machine translation has to pass before it is written:
 * what must survive translation untouched. Lint rules (punctuation, spacing)
 * are style, and fixing them is the reviewer's call, so they never block.
 */
export const GATE_RULE_IDS = [
  'placeholders',
  'numbers',
  'urls-emails',
  'html-tags',
] as const

export interface GateIssue {
  ruleId: string
  message: string
  missing: string[]
  extra: string[]
}

/**
 * - `pass`: nothing to fix, `text` is as given.
 * - `fixed`: a safe one-for-one repair was applied; `text` is the repaired text.
 * - `fail`: at least one rule still fails after every safe repair; `text` is
 *   the text as given, so the reviewer sees what the model wrote.
 */
export type GateResult =
  | { status: 'pass'; text: string }
  | { status: 'fixed'; text: string; original: string }
  | { status: 'fail'; text: string; issues: GateIssue[] }

/**
 * Checks a translation against its source with the Consistency rules and
 * repairs what can be repaired safely (`mismatchAutoFix`: wrong token for
 * missing token, same kind, same count).
 *
 * The source counts as published here: the Consistency scan skips a key whose
 * source is unpublished, but a draft being translated is exactly that case, and
 * the tokens it carries are what the translation must keep. A project's
 * switched-off rule stays off, and tokens are read in its dialect.
 */
export function gateTranslation(
  input: {
    source: string
    sourceLocale: string
    targetLocale: string
    text: string
  },
  settings: ScanSettings = DEFAULT_SCAN_SETTINGS
): GateResult {
  const { source, sourceLocale, targetLocale } = input
  if (!source.trim() || !input.text.trim()) {
    return { status: 'pass', text: input.text }
  }
  const key: ScanKeyInput = {
    keyId: 0,
    key: '',
    tagCount: 0,
    sourceText: source,
    locales: [
      { locale: sourceLocale, draftText: source, publishedText: source },
    ],
  }

  let text = input.text
  const issues: GateIssue[] = []
  for (const ruleId of GATE_RULE_IDS) {
    const issue = recheckLocale(
      ruleId,
      key,
      sourceLocale,
      targetLocale,
      text,
      settings
    )
    if (!issue) continue
    const fixed = mismatchAutoFix(
      ruleId,
      key,
      sourceLocale,
      targetLocale,
      text,
      settings
    )
    if (fixed !== null) {
      text = fixed
      continue
    }
    const mismatch = issue as MismatchIssue
    issues.push({
      ruleId,
      message: describeMismatch(ruleId, mismatch),
      missing: mismatch.missing,
      extra: mismatch.extra,
    })
  }

  if (issues.length) return { status: 'fail', text: input.text, issues }
  return text === input.text
    ? { status: 'pass', text }
    : { status: 'fixed', text, original: input.text }
}
