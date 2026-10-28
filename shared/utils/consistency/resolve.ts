import { DRAFT_KEY_PREFIX, fpTranslation } from '../index'
import { allRules } from './rules'
import {
  extractPlaceholders,
  extractTags,
  extractUrlsEmails,
  hasBranches,
  type Token,
} from './rules/extract'
import { CJK } from './rules/lint-cjk-spacing'
import { numberFormatAutoFix } from './number-format'
import type { I18nDialect } from './dialect'
import {
  DEFAULT_SCAN_SETTINGS,
  type LintIssue,
  type MismatchIssue,
  type ScanKeyInput,
  type ScanKeyLocale,
  type ScanSettings,
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
 * null when the edit passes. `settings` is the project's current Consistency
 * settings: a rule switched off since the scan must not keep reporting here,
 * and tokens are read in the project's dialect.
 */
export function recheckLocale(
  ruleId: string,
  key: ScanKeyInput,
  sourceLocale: string,
  locale: string,
  text: string,
  settings: ScanSettings = DEFAULT_SCAN_SETTINGS
): MismatchIssue | LintIssue | null {
  const rule = allRules.find((candidate) => candidate.id === ruleId)
  if (!rule || settings.ruleSeverity[ruleId] === 'off') return null
  const locales = key.locales.some((row) => row.locale === locale)
    ? key.locales.map((row) =>
        row.locale === locale ? { ...row, publishedText: text } : row
      )
    : [...key.locales, { locale, draftText: text, publishedText: text }]
  const findings = rule.detect({
    ...settings,
    projectId: 0,
    sourceLocale,
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

/**
 * Tokens one swap can stand in for each other: a `{n}` never replaces a
 * `%s`, a closing tag never replaces an opening one.
 */
const SWAPPABLE: Record<
  string,
  {
    extract: (text: string, dialect: I18nDialect) => Token[]
    kind: (raw: string) => string
  }
> = {
  placeholders: {
    extract: extractPlaceholders,
    kind: (raw) =>
      raw.startsWith('@')
        ? 'linked'
        : raw.startsWith('$t(')
          ? 'nesting'
          : raw.startsWith('%')
            ? 'printf'
            : raw.startsWith('{{')
              ? 'double'
              : 'single',
  },
  'urls-emails': {
    extract: extractUrlsEmails,
    kind: (raw) => (raw.includes('://') ? 'url' : 'email'),
  },
  'html-tags': {
    extract: extractTags,
    kind: (raw) =>
      raw.startsWith('</') ? 'close' : raw.endsWith('/>') ? 'self' : 'open',
  },
}

/**
 * One-for-one repair of a source↔translation mismatch: when the translation
 * has exactly as many wrong tokens as it lacks, of the same kinds, each wrong
 * token becomes the missing one in order (`{n}` → `{name}`, `<b>` →
 * `<bold>`). Where to *insert* a lost token is a language decision, so pure
 * gaps get no fix. The result must pass the rule's own recheck — a guess that
 * would still fail is never offered.
 */
export function mismatchAutoFix(
  ruleId: string,
  key: ScanKeyInput,
  sourceLocale: string,
  locale: string,
  text: string,
  settings: ScanSettings = DEFAULT_SCAN_SETTINGS
): string | null {
  const swap = SWAPPABLE[ruleId]
  if (!swap) return null
  const issue = recheckLocale(ruleId, key, sourceLocale, locale, text, settings)
  if (!issue || !('missing' in issue)) return null
  if (!issue.missing.length || issue.missing.length !== issue.extra.length) {
    return null
  }

  const tokens = swap.extract(text, settings.dialect)
  const extras = issue.spans.flatMap(([start]) =>
    tokens.filter((token) => token.start === start)
  )
  if (extras.length !== issue.extra.length) return null

  const byKind = (raws: string[]) => {
    const out = new Map<string, string[]>()
    for (const raw of raws) {
      out.set(swap.kind(raw), [...(out.get(swap.kind(raw)) ?? []), raw])
    }
    return out
  }
  const missingByKind = byKind(issue.missing)
  const extraByKind = byKind(extras.map((token) => token.raw))
  if (missingByKind.size !== extraByKind.size) return null
  for (const [kind, raws] of extraByKind) {
    if (missingByKind.get(kind)?.length !== raws.length) return null
  }

  // Plural/select texts list each wrong token once; every branch has it.
  const everyCopy = hasBranches(text, settings.dialect)
  const replacements: Array<{ start: number; end: number; raw: string }> = []
  const used = new Map<string, number>()
  for (const extra of [...extras].sort((a, b) => a.start - b.start)) {
    const kind = swap.kind(extra.raw)
    const index = used.get(kind) ?? 0
    used.set(kind, index + 1)
    const raw = missingByKind.get(kind)![index]!
    const targets = everyCopy
      ? tokens.filter((token) => token.value === extra.value)
      : [extra]
    for (const target of targets) {
      replacements.push({ start: target.start, end: target.end, raw })
    }
  }

  let next = text
  for (const { start, end, raw } of replacements.sort(
    (a, b) => b.start - a.start
  )) {
    next = next.slice(0, start) + raw + next.slice(end)
  }
  if (next === text) return null
  return recheckLocale(ruleId, key, sourceLocale, locale, next, settings)
    ? null
    : next
}

/** The Resolve drawer's Auto-fix: lint rewrites or a mismatch swap. */
export function autoFix(
  ruleId: string,
  key: ScanKeyInput,
  sourceLocale: string,
  locale: string,
  text: string,
  settings: ScanSettings = DEFAULT_SCAN_SETTINGS
): string | null {
  if (ruleId === 'lint.number-format') {
    const fixed = numberFormatAutoFix(text, locale)
    return fixed &&
      !recheckLocale(ruleId, key, sourceLocale, locale, fixed, settings)
      ? fixed
      : null
  }
  return ruleId.startsWith('lint.')
    ? lintAutoFix(ruleId, text)
    : mismatchAutoFix(ruleId, key, sourceLocale, locale, text, settings)
}

export interface FingerprintedLocale extends ScanKeyLocale {
  sourceFingerprint: string
}

/**
 * How many translations turn Outdated if the source locale is saved & published
 * as `text` (the fix endpoint writes both columns). Mirrors the Outdated
 * predicate: the fingerprint must actually change (it ignores whitespace), the
 * key must not be a draft afterwards, and only translations with text that are
 * currently up to date count — already-outdated rows don't change state.
 */
export function outdatedOnSourceSave(input: {
  sourceLocale: string
  fingerprint: string
  locales: FingerprintedLocale[]
  text: string
}): number {
  const { sourceLocale, fingerprint, text } = input
  if (fpTranslation(text) === fingerprint) return 0
  const after = input.locales.some((row) => row.locale === sourceLocale)
    ? input.locales.map((row) =>
        row.locale === sourceLocale ? { ...row, draftText: text, publishedText: text } : row
      )
    : [
        ...input.locales,
        { locale: sourceLocale, draftText: text, publishedText: text, sourceFingerprint: '' },
      ]
  const isDraft =
    !after.some((row) => (row.publishedText ?? '') !== '') ||
    after.some((row) => (row.draftText ?? '') !== (row.publishedText ?? ''))
  if (isDraft) return 0
  return after.filter(
    (row) =>
      row.locale !== sourceLocale &&
      ((row.draftText ?? '') !== '' || (row.publishedText ?? '') !== '') &&
      row.sourceFingerprint === fingerprint
  ).length
}
