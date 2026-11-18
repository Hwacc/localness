/**
 * The per-project rules an i18n key has to follow. Pure, so a client that
 * names keys itself checks them exactly the way the server does.
 */
export const KEY_STYLE_VALUES = ['snake_case', 'camelCase'] as const

export type KeyStyle = (typeof KEY_STYLE_VALUES)[number]

export type KeyConvention = {
  /** Without the trailing separator; `''` means no prefix. */
  prefix: string
  /** Joins the segments. Must be non-empty — the settings schema enforces it. */
  separator: string
  style: KeyStyle
  /** How many segments may follow the prefix. */
  maxDepth: number
}

/** Why a key does not follow the convention. Sent to the client as a code. */
export type KeyViolation = 'prefix' | 'charset' | 'segment' | 'case' | 'depth'

export const KEY_VIOLATION_TEXT: Record<KeyViolation, string> = {
  prefix: 'Missing the project key prefix',
  charset: 'Uses characters the key convention does not allow',
  segment: 'Has an empty segment',
  case: 'Does not match the configured casing',
  depth: 'Has more segments than the convention allows'
}

const SEGMENT_PATTERN: Record<KeyStyle, RegExp> = {
  snake_case: /^[a-z0-9]+$/,
  camelCase: /^[a-z][A-Za-z0-9]*$/
}

/** The key an empty prefix produces nothing in front of. */
function requiredStart(convention: KeyConvention): string {
  return convention.prefix ? convention.prefix + convention.separator : ''
}

/**
 * Pure: every way `key` breaks the convention, in the order worth fixing.
 *
 * An empty key is **legal** (a symbol-only source text has no name), so it is
 * not a violation here — callers treat it as "cannot name", not as an error.
 *
 * The prefix itself is exempt: it is copied verbatim from the project settings,
 * so the configured rules govern the path that follows it.
 */
export function checkI18nKey(
  key: string,
  convention: KeyConvention
): KeyViolation[] {
  if (!key) return []
  const { separator, style, maxDepth } = convention
  // A separator-less convention has no segments to reason about.
  if (!separator) return []

  const violations: KeyViolation[] = []
  const start = requiredStart(convention)
  const prefixed = Boolean(start) && key.startsWith(start)
  if (start && !prefixed) violations.push('prefix')

  const path = prefixed ? key.slice(start.length) : key
  const separatorChars = new Set(separator.split(''))
  const allowed = (char: string) =>
    /[0-9a-zA-Z]/.test(char) || separatorChars.has(char)
  if ([...path].some((char) => !allowed(char))) violations.push('charset')

  const segments = path.split(separator)
  if (segments.some((segment) => segment === '')) violations.push('segment')
  if (segments.length > maxDepth) violations.push('depth')
  if (segments.some((one) => one && !SEGMENT_PATTERN[style].test(one))) {
    violations.push('case')
  }
  return violations
}
