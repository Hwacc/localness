/**
 * Which declared namespace a key belongs to. Names are relative to the
 * project's key prefix: a key belongs to the namespace that what follows its
 * prefix starts with, followed by a boundary character. Pure, so a client
 * groups keys exactly the way the server does.
 *
 * Any boundary counts, not just the project's `keySeparator`: imports flatten
 * nested JSON with `.`, so one project routinely holds both `s2w_a` and `s2w.a`.
 */

export const NAMESPACE_BOUNDARY = ['_', '.', '-', ':', '/'] as const

const BOUNDARY = new Set<string>(NAMESPACE_BOUNDARY)

function startsWithBoundary(text: string, head: string) {
  return (
    Boolean(head) &&
    text.startsWith(head) &&
    BOUNDARY.has(text.charAt(head.length))
  )
}

/**
 * The key without the project's prefix and the boundary after it. A key that
 * does not carry the prefix comes back whole, so imported or legacy keys still
 * group by the same relative names.
 */
export function stripProjectPrefix(key: string, projectPrefix: string): string {
  return startsWithBoundary(key, projectPrefix)
    ? key.slice(projectPrefix.length + 1)
    : key
}

/**
 * Names are relative to the project prefix. Case-sensitive, like keys. The
 * longest name wins should two ever both match.
 */
export function namespaceOf(
  key: string,
  names: readonly string[],
  projectPrefix: string
): string | null {
  const path = stripProjectPrefix(key, projectPrefix)
  let best: string | null = null
  for (const name of names) {
    if (!startsWithBoundary(path, name)) continue
    if (!best || name.length > best.length) best = name
  }
  return best
}
