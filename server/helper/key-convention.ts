import type { I18nKeyDuplicate } from '#shared/types'
import type { KeyConvention, KeyStyle } from '#shared/utils/key-convention'
import {
  DEFAULT_KEY_CONVENTION,
  KEY_STYLE_VALUES,
} from '#shared/utils/key-convention'

/**
 * The four convention columns as they come off a settings row.
 *
 * Every field is nullable because the same shape covers both levels: on a
 * project row `null` is "unset, use the built-in default", and on a page row it
 * is "unset, ask the project". The empty string is *not* that signal — for the
 * prefix it is a real choice.
 */
export type KeyConventionSource = {
  keyPrefix: string | null
  keySeparator: string | null
  keyStyle: string | null
  keyMaxDepth: number | null
}

function isKeyStyle(value: unknown): value is KeyStyle {
  return (KEY_STYLE_VALUES as readonly unknown[]).includes(value)
}

/** One row's worth of convention, with anything unset falling back to defaults. */
export function toKeyConvention(
  source: KeyConventionSource | null | undefined
): KeyConvention {
  if (!source) return DEFAULT_KEY_CONVENTION
  return {
    prefix: source.keyPrefix ?? DEFAULT_KEY_CONVENTION.prefix,
    // An empty separator would make segments unparseable.
    separator: source.keySeparator || DEFAULT_KEY_CONVENTION.separator,
    style: isKeyStyle(source.keyStyle)
      ? source.keyStyle
      : DEFAULT_KEY_CONVENTION.style,
    maxDepth: source.keyMaxDepth || DEFAULT_KEY_CONVENTION.maxDepth,
  }
}

/**
 * What a page actually runs on: its own convention where it has one, else the
 * project's, else the defaults.
 *
 * The fallback is per field even though the page form writes all four together
 * or leaves all four alone — a row written outside the API should not be able
 * to produce a half-defined convention, and per field is what makes it safe.
 * Note `''` survives both levels: a page that customises to an empty prefix
 * means "no prefix", not "ask the project".
 */
export function resolveKeyConvention(
  page: KeyConventionSource | null | undefined,
  project: KeyConventionSource | null | undefined
): KeyConvention {
  return toKeyConvention({
    keyPrefix: page?.keyPrefix ?? project?.keyPrefix ?? null,
    keySeparator: page?.keySeparator ?? project?.keySeparator ?? null,
    keyStyle: page?.keyStyle ?? project?.keyStyle ?? null,
    keyMaxDepth: page?.keyMaxDepth ?? project?.keyMaxDepth ?? null,
  })
}

/**
 * Pure: which of these keys the project already has, and whether each one holds
 * the text we are naming.
 *
 * Reuse is the point of a shared vocabulary, so a hit is not a problem by
 * itself — the comparison is what tells a legitimate link from two different
 * texts fighting over one name. The rows come from the caller; this only reads
 * them, so it stays testable without a database.
 */
export function shapeKeyDuplicates(
  rows: { key: string; origin: string }[],
  text: string
): I18nKeyDuplicate[] {
  const wanted = text.trim()
  return rows.map((row) => ({
    key: row.key,
    origin: row.origin,
    sameOrigin: row.origin.trim() === wanted,
  }))
}

/**
 * What to say when a rename or a create lands on a key the project already has.
 *
 * Two sentences rather than one because they call for different actions: the
 * same text owning the name means the entry already exists (link to it, or drop
 * one), while a different text owning it means the name is simply taken.
 */
export function keyClashMessage(
  clash: { key: string; origin: string },
  text: string
): string {
  return clash.origin.trim() === text.trim()
    ? `Key "${clash.key}" already exists for the same source text`
    : `Key "${clash.key}" already belongs to a different text: "${clash.origin}"`
}
