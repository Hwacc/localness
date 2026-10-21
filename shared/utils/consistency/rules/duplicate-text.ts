import { fpTranslation } from '../../index'
import { normalizeConsistencyText, normalizeExact, publishedWording } from '../text'
import type {
  ConsistencyFinding,
  ConsistencyRule,
  ScanContext,
  ScanKeyInput,
} from '../types'
import { toMember } from '../types'

/**
 * The v1 pair (identical / near-identical source texts on different keys),
 * now one rule with the exact/near judgment kept internal (2026-10-19:
 * severity became a cross-rule axis). `__draft_` placeholder keys are included
 * on purpose — a placeholder next to a formal key is the most actionable
 * duplicate a design-capture workflow produces.
 *
 * Translation divergence annotation (拍板 6): locales where members' published
 * translations already disagree. Only an exact group escalates to error (R1) —
 * a near group's sources differ, so diverging translations are often right.
 */

function divergedLocales(ctx: ScanContext, members: ScanKeyInput[]): string[] {
  const locales = new Set(
    members.flatMap((member) => member.locales.map((row) => row.locale))
  )
  const diverged: string[] = []
  for (const locale of locales) {
    if (locale === ctx.sourceLocale) continue
    const texts = members
      .map((member) => publishedWording(member, locale))
      .filter((text) => text !== '')
    if (texts.length >= 2 && new Set(texts).size > 1) diverged.push(locale)
  }
  return diverged.sort()
}

export const duplicateTextRule: ConsistencyRule = {
  id: 'duplicate-text',
  defaultSeverity: 'warning',
  category: 'duplicate',
  granularity: 'group',

  detect(ctx: ScanContext): ConsistencyFinding[] {
    const buckets = new Map<string, ScanKeyInput[]>()
    for (const key of ctx.keys) {
      const normalized = normalizeConsistencyText(key.sourceText)
      if (!normalized) continue
      const bucket = buckets.get(normalized)
      if (bucket) bucket.push(key)
      else buckets.set(normalized, [key])
    }

    const findings: ConsistencyFinding[] = []
    for (const [normalized, bucket] of buckets) {
      if (bucket.length < 2) continue
      const exact = new Set(
        bucket.map((member) => normalizeExact(member.sourceText))
      ).size === 1
      const diverged = divergedLocales(ctx, bucket)
      findings.push({
        ruleId: 'duplicate-text',
        severity: exact && diverged.length ? 'error' : 'warning',
        category: 'duplicate',
        groupId: fpTranslation(normalized),
        keys: bucket
          .map(toMember)
          .sort((a, b) => a.key.localeCompare(b.key)),
        meta: diverged.length
          ? { internal: exact ? 'exact' : 'near', diverged }
          : { internal: exact ? 'exact' : 'near' },
      })
    }

    return findings.sort((a, b) => {
      if (a.severity !== b.severity) return a.severity === 'error' ? -1 : 1
      if (b.keys.length !== a.keys.length) return b.keys.length - a.keys.length
      return a.groupId.localeCompare(b.groupId)
    })
  },
}
