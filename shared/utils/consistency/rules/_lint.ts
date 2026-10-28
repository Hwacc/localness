import { publishedSnapshotText, singleKeyGroupId } from '../group-id'
import type { ConsistencyFinding, LintIssue, ScanContext, ScanKeyInput } from '../types'
import { toMember } from '../types'

/** First match of `pattern` as an excerpt + span, or `null`. */
export function firstMatch(
  pattern: RegExp,
  text: string
): { excerpt: string; start: number; end: number } | null {
  const match = pattern.exec(text)
  if (!match) return null
  return {
    excerpt: match[0],
    start: match.index,
    end: match.index + match[0].length,
  }
}

/**
 * Shared shape for lint rules: one finding per key listing every locale whose
 * published text violates the check. Switchable via `ctx.lintRules` — absent
 * means enabled (default-on, 2026-10-19 拍板).
 */
export function detectLint(
  ctx: ScanContext,
  rule: { id: string; defaultSeverity: ConsistencyFinding['severity'] },
  applies: (locale: string) => boolean,
  check: (
    text: string,
    locale: string,
    key: ScanKeyInput
  ) => ReturnType<typeof firstMatch>
): ConsistencyFinding[] {
  if (ctx.lintRules[rule.id] === false) return []

  const findings: ConsistencyFinding[] = []
  for (const key of ctx.keys) {
    const issues: LintIssue[] = []
    for (const row of key.locales) {
      const text = row.publishedText ?? ''
      if (!text) continue
      if (!applies(row.locale)) continue
      const hit = check(text, row.locale, key)
      if (hit) {
        issues.push({
          locale: row.locale,
          excerpt: hit.excerpt,
          text,
          spans: [[hit.start, hit.end]],
        })
      }
    }
    if (!issues.length) continue

    findings.push({
      ruleId: rule.id,
      severity: rule.defaultSeverity,
      category: 'lint',
      groupId: singleKeyGroupId(rule.id, key.keyId, publishedSnapshotText(key)),
      keys: [toMember(key)],
      meta: { issues },
    })
  }
  return findings
}
