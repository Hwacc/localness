import type { KeyConvention, KeyStyle } from '#shared/utils/key-convention'
import {
  DEFAULT_KEY_CONVENTION,
  KEY_STYLE_VALUES,
} from '#shared/utils/key-convention'

/** The four convention columns as they come off the ProjectSettings row. */
export type KeyConventionSource = {
  keyPrefix: string
  keySeparator: string
  keyStyle: string
  keyMaxDepth: number
}

function isKeyStyle(value: string): value is KeyStyle {
  return (KEY_STYLE_VALUES as readonly string[]).includes(value)
}

/**
 * The columns are plain strings, so anything written outside the API — or a row
 * that predates the field — narrows back to the default instead of handing the
 * model and the validator two different rules.
 */
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
