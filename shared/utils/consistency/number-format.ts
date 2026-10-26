import { extractNumbers } from './rules/extract'

/**
 * How a published text writes its numbers against how its locale does.
 * Pure helpers shared by `lint.number-format`, `lint.number-literal`, the
 * report copy and the Auto-fix.
 *
 * Only unambiguous writings are judged. `1.000` can be a thousand or one
 * point zero, so a lone separator followed by exactly three digits is left
 * alone — unless the translation copied it from the source verbatim, which is
 * the one place the ambiguity turns into a real bug (en `1.000` ≠ de `1.000`).
 */

export interface LocaleNumberFormat {
  /** `' '` for every space-like separator, `"'"` for the Swiss apostrophe. */
  group: string
  decimal: string
  /** The group character as the locale writes it (U+202F in French). */
  groupRaw: string
}

export type NumberShape =
  | { kind: 'grouped'; group: string }
  | { kind: 'decimal'; decimal: string }
  | { kind: 'both'; group: string; decimal: string }
  | { kind: 'ambiguous'; sep: string }

const SEPARATOR = /[.,'\u00a0\u202f ]/g
const SPACE_LIKE = /[\u00a0\u202f\u2009 ]/
/** The only group characters `extractNumbers` keeps inside one number. */
const TOKENISED_GROUP = /^[.,'\u00a0\u202f ]$/

const normalizeSeparator = (char: string) =>
  SPACE_LIKE.test(char) ? ' ' : char === '\u2019' ? "'" : char

const formats = new Map<string, LocaleNumberFormat | null>()

/** `null` for an unknown tag or a locale that writes digits other than 0-9. */
export function localeNumberFormat(locale: string): LocaleNumberFormat | null {
  const cached = formats.get(locale)
  if (cached !== undefined) return cached
  let format: LocaleNumberFormat | null = null
  try {
    const formatter = new Intl.NumberFormat(locale.replace(/_/g, '-'))
    if (formatter.resolvedOptions().numberingSystem === 'latn') {
      const parts = formatter.formatToParts(1234567.89)
      const group = parts.find((part) => part.type === 'group')?.value
      const decimal = parts.find((part) => part.type === 'decimal')?.value
      if (group && decimal) {
        format = { group: normalizeSeparator(group), decimal, groupRaw: group }
      }
    }
  } catch {
    format = null
  }
  formats.set(locale, format)
  return format
}

/** `null` for an integer, or digits that are not one number (`1.2.3`, `12.05.2026`). */
export function numberShape(raw: string): NumberShape | null {
  const separators = raw.match(SEPARATOR)
  if (!separators) return null
  const parts = raw.split(SEPARATOR)
  const classes = separators.map(normalizeSeparator)
  const isGroup = (part: string) => part.length === 3

  if (new Set(classes).size === 1) {
    const sep = classes[0]!
    if (separators.length >= 2) {
      return parts.slice(1).every(isGroup) && parts[0]!.length <= 3
        ? { kind: 'grouped', group: sep }
        : null
    }
    if (sep === ' ') return { kind: 'grouped', group: sep }
    const [whole, fraction] = parts as [string, string]
    if (fraction.length !== 3 || whole.length > 3 || whole === '0') {
      return { kind: 'decimal', decimal: sep }
    }
    return { kind: 'ambiguous', sep }
  }

  const decimal = classes.at(-1)!
  const groups = classes.slice(0, -1)
  const group = groups[0]!
  if (
    groups.some((sep) => sep !== group) ||
    group === decimal ||
    parts[0]!.length > 3 ||
    !parts.slice(1, -1).every(isGroup)
  ) {
    return null
  }
  return { kind: 'both', group, decimal }
}

/** How `sep` reads in a locale: a thousands group, a decimal point, or neither. */
function reading(sep: string, format: LocaleNumberFormat) {
  if (sep === format.group) return 'group'
  if (sep === format.decimal) return 'decimal'
  return null
}

export interface NumberSource {
  locale: string
  /** Numbers as written in the key's published source text. */
  raws: ReadonlySet<string>
}

/** `true` when `raw` is written against `locale`'s convention. */
export function violatesLocale(
  raw: string,
  locale: string,
  source?: NumberSource
): boolean {
  const format = localeNumberFormat(locale)
  const shape = numberShape(raw)
  if (!format || !shape) return false
  const wrongGroup = (group: string) => group !== ' ' && group !== format.group

  switch (shape.kind) {
    case 'grouped':
      return wrongGroup(shape.group)
    case 'decimal':
      return shape.decimal !== format.decimal
    case 'both':
      return shape.decimal !== format.decimal || wrongGroup(shape.group)
    case 'ambiguous': {
      if (!source || source.locale === locale || !source.raws.has(raw)) {
        return false
      }
      const sourceFormat = localeNumberFormat(source.locale)
      if (!sourceFormat) return false
      const was = reading(shape.sep, sourceFormat)
      const now = reading(shape.sep, format)
      return was !== null && now !== null && was !== now
    }
    default: {
      const never: never = shape
      return never
    }
  }
}

/**
 * The numbers of `text` worth judging. `v1.5` and `iOS17.2` are versions, not
 * decimals, so a number glued to a letter is skipped.
 */
const LETTER = /\p{L}/u

export function judgedNumbers(text: string) {
  return extractNumbers(text).filter(
    (token) => !(token.start > 0 && LETTER.test(text[token.start - 1]!))
  )
}

export function numberRaws(text: string) {
  return new Set(judgedNumbers(text).map((token) => token.raw))
}

/**
 * A number a person typed with thousands separators — `1,000 users` — rather
 * than a `{count}` formatted at runtime. Plain decimals and space-grouped
 * digits (phone numbers) are not counted.
 */
export function isGroupedLiteral(raw: string, locale: string): boolean {
  const shape = numberShape(raw)
  if (!shape) return false
  switch (shape.kind) {
    case 'grouped':
      return shape.group !== ' '
    case 'both':
      return true
    case 'decimal':
      return false
    case 'ambiguous':
      return shape.sep === localeNumberFormat(locale)?.group
    default: {
      const never: never = shape
      return never
    }
  }
}

/** `raw` rewritten for `locale`, or `null` when there is nothing safe to offer. */
export function rewriteForLocale(raw: string, locale: string): string | null {
  const format = localeNumberFormat(locale)
  const shape = numberShape(raw)
  if (!format || shape?.kind !== 'both' || !violatesLocale(raw, locale)) {
    return null
  }
  // `extractNumbers` would split a number on any other group character, which
  // would turn the fix into a Numbers mismatch.
  const group = format.group === "'" ? "'" : format.groupRaw
  if (!TOKENISED_GROUP.test(group)) return null

  const parts = raw.split(SEPARATOR)
  const last = parts.length - 1
  return parts
    .map((part, index) =>
      index === 0 ? part : `${index === last ? format.decimal : group}${part}`
    )
    .join('')
}

/**
 * Auto-fix: only the writings that carry both separators, where the roles are
 * certain. A lone `1.5` could be a version number, so it is left to a person.
 */
export function numberFormatAutoFix(text: string, locale: string) {
  let next = text
  for (const token of [...judgedNumbers(text)].reverse()) {
    const fixed = rewriteForLocale(token.raw, locale)
    if (fixed) next = next.slice(0, token.start) + fixed + next.slice(token.end)
  }
  return next === text ? null : next
}

/** One sentence for the report: what the number says and what to do about it. */
export function describeNumberFormat(raw: string, locale: string): string {
  const shape = numberShape(raw)
  const format = localeNumberFormat(locale)
  if (!shape || !format) return `"${raw}" is not written the way ${locale} writes numbers`
  if (shape.kind === 'ambiguous') {
    return `"${raw}" is copied from the source, but ${locale} reads "${shape.sep}" the other way (thousands separator vs decimal point) — the number changes meaning`
  }
  const example = new Intl.NumberFormat(locale.replace(/_/g, '-')).format(1234.5)
  const fixed = rewriteForLocale(raw, locale)
  return `"${raw}" uses separators ${locale} does not — ${locale} writes numbers like ${example}${fixed ? `, here "${fixed}"` : ''}`
}
