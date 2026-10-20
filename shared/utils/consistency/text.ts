import type { ScanKeyInput, ScanKeyLocale } from './types'

/**
 * Two levels. `exact` collapses layout whitespace ("Sign in" ≡ "Sign\nin");
 * `near` additionally lowercases and strips Unicode punctuation ("Save." ≡
 * "save"). Symbols are deliberately kept: "C++" and "C" must not merge.
 *
 * Widening either function here changes every group id derived from it, which
 * resets that rule's whitelist — see rules/README.md.
 */

export function normalizeConsistencyText(text: string): string {
  return text
    .toLowerCase()
    .replace(/[\p{P}]/gu, '')
    .replace(/\s+/g, ' ')
    .trim()
}

export function normalizeExact(text: string): string {
  return text.replace(/\s+/g, ' ').trim()
}

/** The wording checks compare against: published copy only (Outdated precedent). */
export function publishedWording(key: ScanKeyInput, locale: string): string {
  return key.locales.find((row) => row.locale === locale)?.publishedText ?? ''
}

export function publishedWritings(key: ScanKeyInput): Array<{
  locale: string
  text: string
}> {
  return key.locales
    .map((row) => ({ locale: row.locale, text: row.publishedText ?? '' }))
    .filter((row) => row.text !== '')
}

/**
 * The source wording every check and card uses: what is live. A key that was
 * ever published uses its published source; one that never was (including
 * `__draft_` placeholders, which never publish) falls back to its draft.
 * `pendingSourceText` is an unpublished edit on top of the live wording —
 * shown beside the card, never judged, so editing a draft can't regroup it.
 */
export function scanSourceText(
  locales: ScanKeyLocale[],
  sourceLocale: string
): { sourceText: string; pendingSourceText?: string } {
  const row = locales.find((candidate) => candidate.locale === sourceLocale)
  const live = row?.publishedText ?? ''
  const draft = row?.draftText ?? ''
  if (live === '') return { sourceText: draft }
  return draft !== '' && draft !== live
    ? { sourceText: live, pendingSourceText: draft }
    : { sourceText: live }
}

