/**
 * One convention object feeds both the model (as context) and the validator, so
 * what the model is asked for and what it is checked against can never
 * disagree. The check itself lives in the contract, which clients share.
 */
import type {
  KeyConvention,
  KeyStyle,
  KeyViolation
} from '../contract/key-convention'
import {
  KEY_STYLE_VALUES,
  KEY_VIOLATION_TEXT,
  checkI18nKey
} from '../contract/key-convention'

export { KEY_STYLE_VALUES, KEY_VIOLATION_TEXT, checkI18nKey }
export type { KeyConvention, KeyStyle, KeyViolation }

export const KEY_STYLES: { value: KeyStyle; label: string }[] =
  KEY_STYLE_VALUES.map((value) => ({ value, label: value }))

/** Column defaults. `prefix` stays empty so existing keys are not flagged. */
export const DEFAULT_KEY_CONVENTION: KeyConvention = {
  prefix: '',
  separator: '_',
  style: 'snake_case',
  maxDepth: 4
}

/**
 * The starting prefix for a new project, derived from its name.
 *
 * A name with nothing latin in it slugs to `''`, which means "no prefix" — that
 * is the documented answer, not a failure.
 */
export function slugKeyPrefix(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
}

export function keyPathDepth(path: string, separator: string): number {
  return path ? path.split(separator).length : 0
}

/**
 * Pure: why a page's key path cannot sit after the project prefix. It must
 * follow the project's rules and leave at least one segment for the generated
 * tail, so `depth` means the path alone already uses the whole budget.
 */
export function checkKeyPath(
  path: string,
  convention: KeyConvention
): KeyViolation[] {
  return checkI18nKey(path, {
    ...convention,
    prefix: '',
    maxDepth: convention.maxDepth - 1
  })
}

export function keyPathViolationText(violation: KeyViolation): string {
  return violation === 'depth'
    ? 'Leaves no segment for the generated key under the project max depth'
    : KEY_VIOLATION_TEXT[violation]
}

/**
 * The convention a page names keys with: the project's, with the page's path
 * appended to the prefix and taken out of the depth budget.
 */
export function withKeyPath(
  convention: KeyConvention,
  path: string | null | undefined
): KeyConvention {
  const trimmed = path?.trim()
  if (!trimmed) return convention
  return {
    ...convention,
    prefix: [convention.prefix, trimmed]
      .filter(Boolean)
      .join(convention.separator),
    maxDepth: Math.max(
      1,
      convention.maxDepth - keyPathDepth(trimmed, convention.separator)
    )
  }
}
