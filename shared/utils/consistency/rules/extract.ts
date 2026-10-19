/**
 * Token extractors shared by the source↔translation rules. Deliberately loose
 * families, not a full ICU parser: they compare presence and counts, never
 * semantics, so over-matching a syntax variant is safer than inventing one.
 *
 * Each token keeps its position: `value` is what the multiset compares,
 * `raw` is what the report shows and `start`/`end` drive the highlight.
 */

export interface Token {
  value: string
  raw: string
  start: number
  end: number
}

const PLACEHOLDER_PATTERN =
  /\{\{[^{}]+\}\}|\{[a-zA-Z_][\w.-]*\}|%(?:\d+\$)?[sdif]/g

const URL_PATTERN = /\bhttps?:\/\/\S+/gi

const EMAIL_PATTERN = /[\w.+-]+@[\w-]+(?:\.[\w-]+)+/g

const HTML_TAG_PATTERN = /<\/?([a-zA-Z][\w-]*)[^<>]*>/g

/** snake_case identifiers (key names, `__draft_x`): their digits are not content. */
const IDENTIFIER_PATTERN = /\w*_\w*/g

/**
 * Group/decimal separators are locale formatting, not content: `1,000` (en),
 * `1.000` (de), `1 000` (fr) and `1'000` (de-CH) are the same number, as are
 * `1.5` / `1,5`. A plain space joins only before a 3-digit group.
 */
const NUMBER_PATTERN = /\d+(?:(?:[.,'\u00a0\u202f]|\s(?=\d{3}(?!\d)))\d+)*/g

function tokens(
  text: string,
  pattern: RegExp,
  value: (match: RegExpMatchArray) => string
): Token[] {
  return [...text.matchAll(pattern)].map((match) => ({
    value: value(match),
    raw: match[0],
    start: match.index!,
    end: match.index! + match[0].length,
  }))
}

/** Same-length blanking keeps every later token's offsets valid. */
function mask(text: string, pattern: RegExp): string {
  return text.replace(pattern, (match) => ' '.repeat(match.length))
}

/** Case is kept: `{Name}` and `{name}` are different variables at runtime. */
export function extractPlaceholders(text: string): Token[] {
  return tokens(text, PLACEHOLDER_PATTERN, (m) => m[0].replace(/\s+/g, ''))
}

export function extractUrlsEmails(text: string): Token[] {
  return [
    ...tokens(text, URL_PATTERN, (m) => m[0]),
    ...tokens(mask(text, URL_PATTERN), EMAIL_PATTERN, (m) => m[0]),
  ]
}

/** Compared by tag name — `<b>` twice vs `<strong>` once is a name mismatch. */
export function extractHtmlTags(text: string): Token[] {
  return tokens(text, HTML_TAG_PATTERN, (m) => m[1]!.toLowerCase())
}

/** Digit sequences, after removing tokens whose digits are not content. */
export function extractNumbers(text: string): Token[] {
  let masked = text
  for (const pattern of [
    URL_PATTERN,
    EMAIL_PATTERN,
    PLACEHOLDER_PATTERN,
    IDENTIFIER_PATTERN,
  ]) {
    masked = mask(masked, pattern)
  }
  return tokens(masked, NUMBER_PATTERN, (m) => m[0].replace(/\D/g, '')).map(
    (token) => ({ ...token, raw: text.slice(token.start, token.end) })
  )
}

/**
 * Multiset comparison by `value`, order-insensitive. Returns the surplus
 * tokens on each side (source-only = missing, target-only = extra), or `null`
 * when they agree.
 */
export function tokenDiff(
  source: Token[],
  target: Token[]
): { missing: Token[]; extra: Token[] } | null {
  const surplus = (from: Token[], against: Token[]) => {
    const budget = new Map<string, number>()
    for (const token of against) {
      budget.set(token.value, (budget.get(token.value) ?? 0) + 1)
    }
    return from.filter((token) => {
      const left = budget.get(token.value) ?? 0
      if (left > 0) {
        budget.set(token.value, left - 1)
        return false
      }
      return true
    })
  }
  const missing = surplus(source, target)
  const extra = surplus(target, source)
  if (!missing.length && !extra.length) return null
  return { missing, extra }
}
