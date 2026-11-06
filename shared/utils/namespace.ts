/**
 * Key namespaces: a project's declared key groups. A key belongs to the
 * namespace its name starts with, followed by a boundary character — derived
 * from the key on every read, never stored, so renaming a key regroups it.
 *
 * Any boundary counts, not just the project's `keySeparator`: imports flatten
 * nested JSON with `.`, so one project routinely holds both `s2w_a` and `s2w.a`.
 */

export const NAMESPACE_BOUNDARY = ['_', '.', '-', ':', '/'] as const

const BOUNDARY = new Set<string>(NAMESPACE_BOUNDARY)

/**
 * Which namespaces a list shows: every key, one namespace by id, the keys in
 * none, or the editor's unnamed placeholder keys (`__unnamed_…`). The last is a
 * Translations-page group only — the delivery API knows nothing of it.
 */
export type NamespaceFilterValue = 'all' | 'ungrouped' | 'unnamed' | number

/** The API's spelling of "keys in no namespace". A name cannot start with `_`. */
export const UNGROUPED_NAMESPACE_PARAM = '__ungrouped__'

/** Case-sensitive, like keys. The longest name wins should two ever both match. */
export function namespaceOf(key: string, names: readonly string[]): string | null {
  let best: string | null = null
  for (const name of names) {
    if (!name || !key.startsWith(name) || !BOUNDARY.has(key.charAt(name.length))) {
      continue
    }
    if (!best || name.length > best.length) best = name
  }
  return best
}

/** Everything before the first boundary; `''` when the text starts with one. */
export function firstSegment(text: string): string {
  const index = [...text].findIndex((char) => BOUNDARY.has(char))
  return index === -1 ? text : text.slice(0, index)
}

/** Two names overlap when keys of one would also match the other. */
function namesOverlap(a: string, b: string) {
  const [short, long] = a.length <= b.length ? [a, b] : [b, a]
  return long.startsWith(short) && BOUNDARY.has(long.charAt(short.length))
}

export type NamespaceNameRejection = 'empty' | 'charset' | 'duplicate' | 'overlap'

export const NAMESPACE_NAME_MESSAGES: Record<NamespaceNameRejection, string> = {
  empty: 'A namespace name is required',
  charset:
    'Use letters and digits, optionally joined by _ . - : / — no spaces, and not starting or ending with a separator',
  duplicate: 'A namespace with this name already exists',
  overlap:
    'Overlaps an existing namespace — one would contain the other’s keys',
}

const NAME_PATTERN = /^[A-Za-z0-9](?:[A-Za-z0-9_.\-:/]*[A-Za-z0-9])?$/

/** Duplicates are judged case-insensitively, like releases; overlap follows matching, which is case-sensitive. */
export function namespaceNameRejectReason(input: {
  name: string
  takenNames: readonly string[]
}): NamespaceNameRejection | null {
  const name = input.name.trim()
  if (!name) return 'empty'
  if (!NAME_PATTERN.test(name)) return 'charset'
  const lower = name.toLowerCase()
  if (input.takenNames.some((taken) => taken.toLowerCase() === lower)) {
    return 'duplicate'
  }
  if (input.takenNames.some((taken) => namesOverlap(taken, name))) {
    return 'overlap'
  }
  return null
}

/** The namespace keys generated under this prefix would land in, or null for Ungrouped. */
export function prefixNamespace(
  prefix: string,
  separator: string,
  names: readonly string[]
): string | null {
  if (!prefix) return null
  return namespaceOf(`${prefix}${separator}x`, names)
}

/** Key counts per namespace name, plus the keys in none. */
export function countByNamespace(
  keys: readonly string[],
  names: readonly string[]
): { byName: Record<string, number>; ungrouped: number } {
  const byName: Record<string, number> = Object.fromEntries(
    names.map((name) => [name, 0])
  )
  let ungrouped = 0
  for (const key of keys) {
    const name = namespaceOf(key, names)
    if (name) byName[name] = (byName[name] ?? 0) + 1
    else ungrouped += 1
  }
  return { byName, ungrouped }
}

/**
 * Candidate names from keys that are in no namespace: their first segment, when
 * enough keys share it to be worth a group and it could be declared as is.
 * `hour_ago` alone stays a key, never a suggestion of `hour`.
 */
export function namespaceSuggestions(
  keys: readonly string[],
  names: readonly string[],
  options: { minCount?: number; limit?: number } = {}
): Array<{ name: string; count: number }> {
  const minCount = options.minCount ?? 2
  const limit = options.limit ?? 20
  const counts = new Map<string, number>()
  for (const key of keys) {
    if (namespaceOf(key, names)) continue
    const segment = firstSegment(key)
    if (!segment || segment === key) continue
    counts.set(segment, (counts.get(segment) ?? 0) + 1)
  }
  return [...counts]
    .filter(
      ([name, count]) =>
        count >= minCount &&
        namespaceNameRejectReason({ name, takenNames: names }) === null
    )
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, limit)
    .map(([name, count]) => ({ name, count }))
}

/** A stored filter whose namespace was deleted falls back to All. */
export function resolveNamespaceFilterValue(
  stored: unknown,
  namespaces: ReadonlyArray<{ id: string | number }> | undefined
): NamespaceFilterValue {
  if (stored === 'ungrouped' || stored === 'unnamed') return stored
  if (typeof stored !== 'number') return 'all'
  return (namespaces ?? []).some((ns) => Number(ns.id) === stored)
    ? stored
    : 'all'
}
