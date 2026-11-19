import type { I18nKeyDuplicate } from '#shared/types'
import type { KeyConvention, KeyStyle } from '#shared/utils/key-convention'
import {
  DEFAULT_KEY_CONVENTION,
  KEY_STYLE_VALUES,
  checkKeyPath,
  keyPathViolationText,
  keyViolationErrors,
  withKeyPath,
} from '#shared/utils/key-convention'

/**
 * The four convention columns as they come off a project settings row. `null`
 * is "unset, use the built-in default". The empty string is *not* that signal —
 * for the prefix it is a real choice.
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
  source: KeyConventionSource | null | undefined,
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
 * What a page actually runs on: the project's convention, with the page's key
 * path appended to the prefix. A page can only add segments, never replace or
 * drop the project's prefix, so every key it names still passes the project's
 * own check.
 */
export function resolveKeyConvention(
  page: { keyPath: string | null } | null | undefined,
  project: KeyConventionSource | null | undefined,
): KeyConvention {
  return withKeyPath(toKeyConvention(project), page?.keyPath)
}

/**
 * The page key path to store: trimmed, `null` for none. A path with a
 * convention error is a 400 — the page would hand the AI a start that every key
 * it names then fails. Style warnings are the form's to show, not to refuse.
 */
export function normalizeKeyPath(
  path: string | null | undefined,
  project: KeyConventionSource | null | undefined,
): string | null {
  const trimmed = path?.trim()
  if (!trimmed) return null
  const violations = keyViolationErrors(
    checkKeyPath(trimmed, toKeyConvention(project)),
  )
  if (violations.length) {
    throw createError({
      statusCode: 400,
      statusMessage: `Invalid key path: ${violations.map(keyPathViolationText).join('; ')}`,
    })
  }
  return trimmed
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
  rows: { key: string; sourceText: string }[],
  text: string,
): I18nKeyDuplicate[] {
  const wanted = text.trim()
  return rows.map((row) => ({
    key: row.key,
    sourceText: row.sourceText,
    sameSourceText: row.sourceText.trim() === wanted,
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
  clash: { key: string; sourceText: string },
  text: string,
): string {
  return clash.sourceText.trim() === text.trim()
    ? `Key "${clash.key}" already exists for the same source text`
    : `Key "${clash.key}" already belongs to a different text: "${clash.sourceText}"`
}
