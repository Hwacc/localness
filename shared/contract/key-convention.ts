/**
 * The per-project rules an i18n key has to follow. Pure, so a client that
 * names keys itself checks them exactly the way the server does.
 */
export const KEY_STYLE_VALUES = ['snake_case', 'camelCase', 'none'] as const

export type KeyStyle = (typeof KEY_STYLE_VALUES)[number]

export type KeyConvention = {
  /** Without the trailing separator; `''` means no prefix. */
  prefix: string
  /** The suggested joint between levels. Must be non-empty — the settings schema enforces it. */
  separator: string
  /** `none` leaves casing to the project, for keys named before the convention existed. */
  style: KeyStyle
  /** The suggested number of levels after the prefix. */
  maxDepth: number
}

export const KEY_VIOLATION_VALUES = [
  'prefix',
  'charset',
  'segment',
  'separator',
  'case',
  'depth',
] as const

/** Why a key does not follow the convention. Sent to the client as a code. */
export type KeyViolation = (typeof KEY_VIOLATION_VALUES)[number]

/**
 * Errors make a key unusable as a name; warnings are the project's style, which
 * legacy keys may never have followed, so nothing refuses a key over them.
 */
export const KEY_VIOLATION_LEVEL: Record<KeyViolation, 'error' | 'warning'> = {
  prefix: 'error',
  charset: 'error',
  segment: 'error',
  separator: 'warning',
  case: 'warning',
  depth: 'warning',
}

export const KEY_VIOLATION_TEXT: Record<KeyViolation, string> = {
  prefix: 'Missing the project key prefix',
  charset: 'Uses characters other than letters, digits, ".", "_" and "-"',
  segment: 'Has an empty segment',
  separator: 'Uses a separator other than the configured one',
  case: 'Does not match the configured casing',
  depth: 'Has more levels than the convention suggests',
}

export function keyViolationErrors(violations: KeyViolation[]): KeyViolation[] {
  return violations.filter((one) => KEY_VIOLATION_LEVEL[one] === 'error')
}

export function keyViolationWarnings(
  violations: KeyViolation[],
): KeyViolation[] {
  return violations.filter((one) => KEY_VIOLATION_LEVEL[one] === 'warning')
}

/** Characters any key may use to join its parts, whatever the configured separator. */
const KEY_BOUNDARY = ['.', '_', '-']

const WORD_PATTERN: Record<Exclude<KeyStyle, 'none'>, RegExp> = {
  snake_case: /^[a-z0-9]+$/,
  camelCase: /^[a-z][A-Za-z0-9]*$/,
}

function boundaryChars(separator: string): Set<string> {
  return new Set([...KEY_BOUNDARY, ...separator])
}

/**
 * The characters that start a new level. In a snake_case project whose
 * separator is not `_`, the underscore joins words inside one level.
 */
function levelChars(convention: KeyConvention): Set<string> {
  const chars = boundaryChars(convention.separator)
  if (
    convention.style === 'snake_case' &&
    !convention.separator.includes('_')
  ) {
    chars.delete('_')
  }
  return chars
}

function splitOn(text: string, chars: Set<string>): string[] {
  const parts: string[] = ['']
  for (const char of text) {
    if (chars.has(char)) parts.push('')
    else parts[parts.length - 1] += char
  }
  return parts
}

/** How many levels a key path has under the convention. */
export function keyDepth(path: string, convention: KeyConvention): number {
  return path ? splitOn(path, levelChars(convention)).length : 0
}

/**
 * Pure: every way `key` breaks the convention, in the order worth fixing. Use
 * `KEY_VIOLATION_LEVEL` to tell what must block from what is only advice.
 *
 * An empty key is **legal** (a symbol-only source text has no name), so it is
 * not a violation here — callers treat it as "cannot name", not as an error.
 *
 * The prefix itself is exempt: it is copied verbatim from the project settings,
 * so the configured rules govern the path that follows it. Any boundary
 * character may follow it, so legacy keys that joined it differently still count.
 */
export function checkI18nKey(
  key: string,
  convention: KeyConvention,
): KeyViolation[] {
  if (!key) return []
  const { prefix, separator, style, maxDepth } = convention
  // A separator-less convention has no segments to reason about.
  if (!separator) return []

  const boundary = boundaryChars(separator)
  const violations: KeyViolation[] = []
  const prefixed =
    Boolean(prefix) &&
    key.startsWith(prefix) &&
    boundary.has(key.charAt(prefix.length))
  if (prefix && !prefixed) violations.push('prefix')

  const path = prefixed ? key.slice(prefix.length + 1) : key
  const allowed = (char: string) =>
    /[0-9a-zA-Z]/.test(char) || boundary.has(char)
  if ([...path].some((char) => !allowed(char))) violations.push('charset')

  if (splitOn(path, boundary).some((word) => word === '')) {
    violations.push('segment')
  }
  const levels = levelChars(convention)
  if ([...path].some((char) => levels.has(char) && !separator.includes(char))) {
    violations.push('separator')
  }
  if (style !== 'none') {
    const words = splitOn(path, boundary)
    if (words.some((word) => word && !WORD_PATTERN[style].test(word))) {
      violations.push('case')
    }
  }
  if (keyDepth(path, convention) > maxDepth) violations.push('depth')
  return violations
}
