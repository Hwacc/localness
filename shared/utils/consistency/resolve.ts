import { DRAFT_KEY_PREFIX } from '../index'
import { allRules } from './rules'
import { CJK } from './rules/lint-cjk-spacing'
import type {
  LintIssue,
  MismatchIssue,
  ScanKeyInput,
  ScanKeyLocale,
} from './types'

/**
 * Disposition logic for the Resolve drawer, shared so the preview the user
 * reads is the plan the server executes. Nothing here touches the database.
 */

/** One duplicate member with the facts the merge decision needs. */
export interface MergeCandidate {
  keyId: number
  key: string
  tagCount: number
  /** ISO timestamp; the older key wins a tie. */
  createdAt: string
  locales: ScanKeyLocale[]
}

const hasText = (value: string | null | undefined): value is string =>
  (value ?? '').trim() !== ''

/** Ever published in any locale — code or the delivery API may read it. */
export function isPublishedKey(candidate: Pick<MergeCandidate, 'locales'>) {
  return candidate.locales.some((row) => hasText(row.publishedText))
}

function publishedLocaleCount(candidate: MergeCandidate) {
  return candidate.locales.filter((row) => hasText(row.publishedText)).length
}

const isDraftKeyName = (key: string) => key.startsWith(DRAFT_KEY_PREFIX)

/**
 * The key to keep, and why — in priority order: published (code references
 * its name), a named key over a `__draft_` placeholder, more tags, more
 * published languages, older. Reasons list what the winner actually has, so
 * the drawer can say "Suggested: published · 12 tags · 5 languages".
 */
export function suggestKeeper(
  candidates: MergeCandidate[]
): { keyId: number; reasons: string[] } | null {
  if (!candidates.length) return null
  const ranked = [...candidates].sort(
    (a, b) =>
      Number(isPublishedKey(b)) - Number(isPublishedKey(a)) ||
      Number(isDraftKeyName(a.key)) - Number(isDraftKeyName(b.key)) ||
      b.tagCount - a.tagCount ||
      publishedLocaleCount(b) - publishedLocaleCount(a) ||
      a.createdAt.localeCompare(b.createdAt) ||
      a.keyId - b.keyId
  )
  const winner = ranked[0]!
  const reasons: string[] = []
  if (isPublishedKey(winner)) reasons.push('published')
  if (!isDraftKeyName(winner.key)) reasons.push('named key')
  if (winner.tagCount)
    reasons.push(`${winner.tagCount} ${winner.tagCount === 1 ? 'tag' : 'tags'}`)
  const languages = publishedLocaleCount(winner)
  if (languages)
    reasons.push(`${languages} ${languages === 1 ? 'language' : 'languages'}`)
  return { keyId: winner.keyId, reasons }
}

/**
 * Why a member cannot be merged away, or null. A published key must be
 * reverted to draft first — deleting it would break whatever reads its name.
 */
export function mergeBlockReason(
  candidate: Pick<MergeCandidate, 'locales'>
): 'published' | null {
  return isPublishedKey(candidate) ? 'published' : null
}

export interface LocaleChoice {
  locale: string
  /**
   * `fill`: the keeper lacks this locale and the merged keys agree on one text.
   * `conflict`: two or more different texts — the user must pick one.
   */
  status: 'fill' | 'conflict'
  options: Array<{ text: string; keyIds: number[] }>
  /** Key whose text is preselected: the keeper's own, else the first option. */
  defaultKeyId: number
}

function draftOf(candidate: MergeCandidate, locale: string) {
  const text = candidate.locales.find((row) => row.locale === locale)?.draftText
  return hasText(text) ? text : null
}

/**
 * Per-locale decisions a merge needs. Locales where everyone agrees (or only
 * the keeper has text) need none and are omitted; the source locale is the
 * duplicate's own wording and always stays the keeper's.
 */
export function planLocaleChoices(
  keeper: MergeCandidate,
  merged: MergeCandidate[],
  sourceLocale: string
): LocaleChoice[] {
  const locales = new Set<string>()
  for (const candidate of [keeper, ...merged])
    for (const row of candidate.locales) locales.add(row.locale)
  locales.delete(sourceLocale)

  const out: LocaleChoice[] = []
  for (const locale of [...locales].sort()) {
    const options: LocaleChoice['options'] = []
    for (const candidate of [keeper, ...merged]) {
      const text = draftOf(candidate, locale)
      if (text === null) continue
      const existing = options.find((option) => option.text === text)
      if (existing) existing.keyIds.push(candidate.keyId)
      else options.push({ text, keyIds: [candidate.keyId] })
    }
    if (!options.length) continue
    const keeperText = draftOf(keeper, locale)
    if (options.length === 1) {
      if (keeperText !== null) continue
      out.push({
        locale,
        status: 'fill',
        options,
        defaultKeyId: options[0]!.keyIds[0]!,
      })
      continue
    }
    out.push({
      locale,
      status: 'conflict',
      options,
      defaultKeyId: keeperText !== null ? keeper.keyId : options[0]!.keyIds[0]!,
    })
  }
  return out
}

/**
 * Texts the keeper receives: each choice resolved to the picked key's draft,
 * kept only where it differs from what the keeper already has. Throws on a
 * pick that is not one of the offered keys — the server relies on this so a
 * merge can only move existing text, never invent it.
 */
export function resolveMergeWrites(
  keeper: MergeCandidate,
  merged: MergeCandidate[],
  sourceLocale: string,
  picks: Record<string, number>
): Record<string, string> {
  const byId = new Map([keeper, ...merged].map((c) => [c.keyId, c]))
  const writes: Record<string, string> = {}
  for (const choice of planLocaleChoices(keeper, merged, sourceLocale)) {
    const pickedId = picks[choice.locale] ?? choice.defaultKeyId
    if (!choice.options.some((option) => option.keyIds.includes(pickedId))) {
      throw new Error(`Invalid pick for ${choice.locale}: key ${pickedId}`)
    }
    const text = draftOf(byId.get(pickedId)!, choice.locale)!
    if (text !== draftOf(keeper, choice.locale)) writes[choice.locale] = text
  }
  return writes
}

// ── Single-key fixes ───────────────────────────────────────────────────────

// Mirrors the rules' own patterns, so a fix always clears its finding.
const FRENCH_SPACE_BEFORE = / ([!?;:])/g
const CJK_THEN_LATIN = new RegExp(`([${CJK}])([A-Za-z0-9])`, 'g')
const LATIN_THEN_CJK = new RegExp(`([A-Za-z0-9])([${CJK}])`, 'g')

/**
 * The deterministic rewrite for a lint rule, or null when the rule has none
 * (terminal punctuation depends on the sentence) or nothing would change.
 */
export function lintAutoFix(ruleId: string, text: string): string | null {
  let next: string
  switch (ruleId) {
    case 'lint.ellipsis':
      next = text.replace(/\.{3,}/g, '…')
      break
    case 'lint.double-space':
      next = text.replace(/ {2,}/g, ' ')
      break
    case 'lint.french-spacing':
      next = text.replace(FRENCH_SPACE_BEFORE, '\u202f$1')
      break
    case 'lint.cjk-spacing':
      next = text.replace(CJK_THEN_LATIN, '$1 $2').replace(LATIN_THEN_CJK, '$1 $2')
      break
    default:
      return null
  }
  return next === text ? null : next
}

/**
 * Re-run one rule against a key with `locale`'s published text replaced by
 * `text` — the live check under the editor. Returns that locale's issue, or
 * null when the edit passes.
 */
export function recheckLocale(
  ruleId: string,
  key: ScanKeyInput,
  sourceLocale: string,
  locale: string,
  text: string
): MismatchIssue | LintIssue | null {
  const rule = allRules.find((candidate) => candidate.id === ruleId)
  if (!rule) return null
  const locales = key.locales.some((row) => row.locale === locale)
    ? key.locales.map((row) =>
        row.locale === locale ? { ...row, publishedText: text } : row
      )
    : [...key.locales, { locale, draftText: text, publishedText: text }]
  const findings = rule.detect({
    projectId: 0,
    sourceLocale,
    lintRules: {},
    keys: [{ ...key, locales }],
  })
  for (const finding of findings) {
    const issues = finding.meta?.issues
    if (!Array.isArray(issues)) continue
    const hit = (issues as Array<MismatchIssue | LintIssue>).find(
      (issue) => issue.locale === locale
    )
    if (hit) return hit
  }
  return null
}
