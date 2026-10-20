import { publishedSnapshotText, singleKeyGroupId } from '../group-id'
import { publishedWording } from '../text'
import type {
  ConsistencyFinding,
  MismatchIssue,
  ScanContext,
  TextSpan,
} from '../types'
import { toMember } from '../types'
import { hasBranches, tokenDiff, type Token } from './extract'

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
 * One plural-family member against its family (i18next `_one`/`_other`…).
 * Missing: this form's source tokens the translation lacks. Extra: tokens no
 * form of the source uses — a language may move a token between forms (ru
 * `_one` needs `{{count}}` for 21, 31…). `optional` tokens are never reported.
 */
function familyDiff(
  sourceTokens: Token[],
  familyValues: Set<string>,
  target: Token[],
  optional: (token: Token) => boolean
): { missing: Token[]; extra: Token[] } | null {
  const targetValues = new Set(target.map((token) => token.value))
  const missing = uniqueByValue(sourceTokens).filter(
    (token) => !optional(token) && !targetValues.has(token.value)
  )
  const extra = uniqueByValue(target).filter(
    (token) => !optional(token) && !familyValues.has(token.value)
  )
  return missing.length || extra.length ? { missing, extra } : null
}

/**
 * Shared shape for the source↔translation token rules: one finding per key
 * whose published translations disagree with the published source. Keys whose
 * source is not published are not in the delivered copy, so they cannot be a
 * user-visible mismatch — they are skipped (published-only, 2026-10-19) —
 * except an i18next plural form the source language lacks, which is checked
 * against the family's `_other` (`meta.sourceKey` names it).
 *
 * `meta` carries the texts and offsets the report needs to explain itself:
 * `source` is the published source, each issue quotes its translation.
 */
export function detectTokenMismatches(
  ctx: ScanContext,
  rule: { id: string; defaultSeverity: ConsistencyFinding['severity'] },
  extract: (text: string) => Token[],
  options: {
    skipTokenlessSource?: boolean
    /** Tokens a plural form may drop or add (`{{count}}`). */
    pluralOptional?: (token: Token) => boolean
  } = {}
): ConsistencyFinding[] {
  const findings: ConsistencyFinding[] = []
  const optional = options.pluralOptional ?? (() => false)
  for (const key of ctx.keys) {
    const family = key.pluralFamily
    const own = publishedWording(key, ctx.sourceLocale)
    // A form the source language lacks (en has no `_few`) is held to `_other`.
    const fallback = own
      ? undefined
      : family?.sources.find((member) => member.key === family.otherKey)
    const source = own || fallback?.text || ''
    if (!source) continue
    const sourceTokens = extract(source)
    const familyValues = family
      ? new Set(
          family.sources.flatMap((member) =>
            extract(member.text).map((token) => token.value)
          )
        )
      : null
    if (options.skipTokenlessSource && !sourceTokens.length) continue

    const issues: MismatchIssue[] = []
    for (const row of key.locales) {
      if (row.locale === ctx.sourceLocale) continue
      const text = row.publishedText ?? ''
      if (!text) continue
      // Plural/select repeats tokens per branch; branch counts differ by language.
      const diff = familyValues
        ? familyDiff(sourceTokens, familyValues, extract(text), optional)
        : hasBranches(source) || hasBranches(text)
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
      meta: {
        source,
        ...(fallback ? { sourceKey: fallback.key } : {}),
        issues,
      },
    })
  }
  return findings
}
