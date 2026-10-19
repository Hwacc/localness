import type { ConsistencyFinding } from './types'

export interface IgnoreRow {
  ruleId: string
  groupId: string
  keyIds: number[]
}

/**
 * A finding stays ignored while its members are a subset of the whitelist
 * snapshot (R2): deleting or merging members down keeps the quiet, but a NEW
 * key joining the group resurfaces it — a whitelist row must never silently
 * swallow a duplicate it has never seen. Same ruleId+groupId with a text
 * change is impossible: the id carries the text hash.
 */
export function partitionIgnored<
  T extends Pick<ConsistencyFinding, 'ruleId' | 'groupId' | 'keys'>,
>(
  findings: T[],
  ignores: IgnoreRow[]
): { active: T[]; ignored: T[] } {
  const snapshots = new Map<string, Set<number>>()
  for (const row of ignores) {
    snapshots.set(`${row.ruleId} ${row.groupId}`, new Set(row.keyIds))
  }

  const active: T[] = []
  const ignored: T[] = []
  for (const finding of findings) {
    const snapshot = snapshots.get(`${finding.ruleId} ${finding.groupId}`)
    const covered =
      snapshot != null &&
      finding.keys.every((member) => snapshot.has(member.keyId))
    if (covered) ignored.push(finding)
    else active.push(finding)
  }
  return { active, ignored }
}
