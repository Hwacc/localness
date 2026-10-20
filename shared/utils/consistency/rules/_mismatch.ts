import { publishedSnapshotText, singleKeyGroupId } from '../group-id'
import { publishedWording } from '../text'
import type {
  ConsistencyFinding,
  MismatchIssue,
  ScanContext,
  TextSpan,
} from '../types'
import { toMember } from '../types'
import { hasIcuBlock, tokenDiff, type Token } from './extract'

const spansOf = (tokens: Token[]): TextSpan[] =>
  tokens.map((token) => [token.start, token.end])

function uniqueByValue(tokens: Token[]): Token[] {
  const seen = new Set<string>()
  return tokens.filter((token) => {
    if (seen.has(token.value)) return false
    seen.add(token.value)
    return true
  })
}

/**
 * Shared shape for the source↔translation token rules: one finding per key
 * whose published translations disagree with the published source. Keys whose
 * source is not published are not in the delivered copy, so they cannot be a
 * user-visible mismatch — they are skipped (published-only, 2026-10-19).
 *
 * `meta` carries the texts and offsets the report needs to explain itself:
 * `source` is the published source, each issue quotes its translation.
 */
export function detectTokenMismatches(
  ctx: ScanContext,
  rule: { id: string; defaultSeverity: ConsistencyFinding['severity'] },
  extract: (text: string) => Token[],
  options: { skipTokenlessSource?: boolean } = {}
): ConsistencyFinding[] {
  const findings: ConsistencyFinding[] = []
  for (const key of ctx.keys) {
    const source = publishedWording(key, ctx.sourceLocale)
    if (!source) continue
    const sourceTokens = extract(source)
    if (options.skipTokenlessSource && !sourceTokens.length) continue

    const issues: MismatchIssue[] = []
    for (const row of key.locales) {
      if (row.locale === ctx.sourceLocale) continue
      const text = row.publishedText ?? ''
      if (!text) continue
      // ICU repeats tokens per branch and branch counts differ by language.
      const asSet = hasIcuBlock(source) || hasIcuBlock(text)
      const diff = asSet
        ? tokenDiff(uniqueByValue(sourceTokens), uniqueByValue(extract(text)))
        : tokenDiff(sourceTokens, extract(text))
      if (!diff) continue
      issues.push({
        locale: row.locale,
        missing: diff.missing.map((token) => token.raw),
        extra: diff.extra.map((token) => token.raw),
        text,
        spans: spansOf(diff.extra),
        sourceSpans: spansOf(diff.missing),
      })
    }
    if (!issues.length) continue

    findings.push({
      ruleId: rule.id,
      severity: rule.defaultSeverity,
      category: 'mismatch',
      groupId: singleKeyGroupId(rule.id, key.keyId, publishedSnapshotText(key)),
      keys: [toMember(key)],
      meta: { source, issues },
    })
  }
  return findings
}
