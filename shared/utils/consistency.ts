import { fpTranslation } from './index'

/**
 * Cross-key duplicate detection for the consistency report: keys whose source
 * texts are the same sentence bound to different keys. Kept pure so the rules
 * are testable on their own — the endpoint loads, this decides.
 *
 * Two levels. `exact` collapses layout whitespace ("Sign in" ≡ "Sign\nin");
 * `near` additionally lowercases and strips Unicode punctuation ("Save." ≡
 * "save"). Symbols are deliberately kept: "C++" and "C" must not merge. Every
 * new rule that widens the match goes here, not in the endpoint.
 */

export interface ConsistencyMember {
  keyId: number
  key: string
  sourceText: string
  tagCount: number
}

export interface ConsistencyGroup {
  /** Stable per normalized text, so the UI can key rows across refreshes. */
  id: string
  severity: 'exact' | 'near'
  members: ConsistencyMember[]
}

export function normalizeConsistencyText(text: string): string {
  return text
    .toLowerCase()
    .replace(/[\p{P}]/gu, '')
    .replace(/\s+/g, ' ')
    .trim()
}

function normalizeExact(text: string): string {
  return text.replace(/\s+/g, ' ').trim()
}

/**
 * One group per near-normalized text that at least two keys share. `exact` if
 * every member also agrees at the whitespace level, `near` otherwise — a
 * group's severity is its worst member pair. Empty or fully-punctuation source
 * texts drop out; they have nothing to compare.
 */
export function buildConsistencyGroups(
  members: ConsistencyMember[]
): ConsistencyGroup[] {
  const buckets = new Map<string, ConsistencyMember[]>()
  for (const member of members) {
    const normalized = normalizeConsistencyText(member.sourceText)
    if (!normalized) continue
    const bucket = buckets.get(normalized)
    if (bucket) bucket.push(member)
    else buckets.set(normalized, [member])
  }

  const groups: ConsistencyGroup[] = []
  for (const [normalized, bucket] of buckets) {
    if (bucket.length < 2) continue
    const exactForms = new Set(
      bucket.map((member) => normalizeExact(member.sourceText))
    )
    groups.push({
      id: fpTranslation(normalized),
      severity: exactForms.size === 1 ? 'exact' : 'near',
      members: bucket.sort((a, b) => a.key.localeCompare(b.key)),
    })
  }

  return groups.sort((a, b) => {
    if (a.severity !== b.severity) return a.severity === 'exact' ? -1 : 1
    if (b.members.length !== a.members.length) {
      return b.members.length - a.members.length
    }
    return a.id.localeCompare(b.id)
  })
}
