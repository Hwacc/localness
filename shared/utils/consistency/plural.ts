import { dialectSyntax, type I18nDialect } from './dialect'
import type { ScanKeyLocale } from './types'

/**
 * i18next (v21+, JSON v4) stores plurals as sibling keys: `items_one`,
 * `items_other`, plus `_zero/_two/_few/_many` where a language needs them and
 * `items_ordinal_one…` for ordinals. Each language fills only its own forms,
 * so the source rarely has `_few`/`_many`, and `_one` may legitimately drop
 * `{{count}}` in one language but keep it in another (ru `_one` covers 21, 31…).
 *
 * The family travels on each scan key (`ScanKeyInput.pluralFamily`) so a
 * single-key recheck sees the same family the full scan did.
 */

const PLURAL_SUFFIX = /_(?:zero|one|two|few|many|other)$/

export interface PluralFamily {
  /** `items` for `items_one`; `items_ordinal` for `items_ordinal_one`. */
  base: string
  /** The `_other` member — the form every language has. */
  otherKey: string
  /** Published source wording of each member that has one. */
  sources: Array<{ key: string; text: string }>
  /** Some member is bound to a frame. */
  tagged: boolean
}

export function pluralBase(key: string): string | null {
  const match = PLURAL_SUFFIX.exec(key)
  return match ? key.slice(0, match.index) : null
}

interface FamilyEntry {
  key: string
  tagCount: number
  locales: ScanKeyLocale[]
}

/**
 * Attach each key's family. A real family has at least two members, one of
 * them `_other` — a lone `button_other` is just a key name. `entries` may hold
 * siblings beyond `keys` (a drawer loads only the finding's members). A
 * dialect without plural keys (vue-i18n) has no families: `step_one` /
 * `step_other` there are two ordinary keys.
 */
export function withPluralFamilies<T extends FamilyEntry>(
  keys: T[],
  sourceLocale: string,
  {
    dialect = 'auto',
    entries = keys,
  }: { dialect?: I18nDialect; entries?: FamilyEntry[] } = {}
): Array<T & { pluralFamily?: PluralFamily }> {
  if (!dialectSyntax(dialect).pluralKeys) return keys
  const byBase = new Map<string, FamilyEntry[]>()
  for (const entry of entries) {
    const base = pluralBase(entry.key)
    if (base === null) continue
    if (byBase.get(base)?.some((member) => member.key === entry.key)) continue
    byBase.set(base, [...(byBase.get(base) ?? []), entry])
  }
  const families = new Map<string, PluralFamily>()
  for (const [base, members] of byBase) {
    const otherKey = `${base}_other`
    if (members.length < 2 || !members.some((m) => m.key === otherKey)) continue
    families.set(base, {
      base,
      otherKey,
      sources: members.flatMap((member) => {
        const text =
          member.locales.find((row) => row.locale === sourceLocale)
            ?.publishedText ?? ''
        return text ? [{ key: member.key, text }] : []
      }),
      tagged: members.some((member) => member.tagCount > 0),
    })
  }
  return keys.map((key) => {
    const base = pluralBase(key.key)
    const family = base === null ? undefined : families.get(base)
    return family ? { ...key, pluralFamily: family } : key
  })
}

/** Every key name a family with this base could hold — for sibling lookups. */
export function pluralSiblingNames(base: string): string[] {
  return ['zero', 'one', 'two', 'few', 'many', 'other'].map(
    (form) => `${base}_${form}`
  )
}
