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

/** `{count, plural, …}` head; group 1 is the argument name. */
const ICU_HEAD_PATTERN =
  /\{\s*([a-zA-Z_][\w.-]*)\s*,\s*(?:plural|selectordinal|select)\s*,/g

/** `=0 {…}` selectors and `offset:1` choose a branch; they are not copy. */
const ICU_SELECTOR_PATTERN = /=\d+(?=\s*\{)|offset\s*:\s*\d+/g

/**
 * ICU plural/select repeats the same variables once per branch, and every
 * language has its own branch count (en 2, ru 4, ja 1). Texts carrying it are
 * compared by which tokens appear, not how often.
 */
export function hasIcuBlock(text: string): boolean {
  return new RegExp(ICU_HEAD_PATTERN.source).test(text)
}

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

const PRINTF_PATTERN = /^%(?:(\d+)\$)?([sdif])$/

/**
 * Case is kept: `{Name}` and `{name}` are different variables at runtime.
 *
 * printf is compared by type: a translator reorders with `%2$s … %1$s`, so
 * `%1$s` is the same slot as `%s`. A position beyond the text's own printf
 * count cannot be filled and keeps its raw form, so it surfaces as extra.
 */
export function extractPlaceholders(text: string): Token[] {
  const icu = hasIcuBlock(text)
  const found = tokens(text, PLACEHOLDER_PATTERN, (m) => {
    const value = m[0].replace(/\s+/g, '')
    // `one {{n} file}` is a branch holding `{n}`, never a `{{x}}` placeholder.
    return icu && value.startsWith('{{') ? value.slice(1, -1) : value
  })
  const printfCount = found.filter((t) => PRINTF_PATTERN.test(t.value)).length
  const placeholders = found.map((token) => {
    const printf = PRINTF_PATTERN.exec(token.value)
    if (!printf) return token
    const [, position, type] = printf
    if (position && (Number(position) < 1 || Number(position) > printfCount)) {
      return token
    }
    return { ...token, value: `%${type}` }
  })
  if (!icu) return placeholders
  // The ICU argument itself is a variable the app fills: `{count, plural…}`.
  const heads = [...text.matchAll(ICU_HEAD_PATTERN)].map((m) => {
    const start = m.index! + m[0].indexOf(m[1]!)
    return {
      value: `{${m[1]}}`,
      raw: `{${m[1]}}`,
      start,
      end: start + m[1]!.length,
    }
  })
  return [...heads, ...placeholders].sort((a, b) => a.start - b.start)
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
    ...(hasIcuBlock(text) ? [ICU_SELECTOR_PATTERN] : []),
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
