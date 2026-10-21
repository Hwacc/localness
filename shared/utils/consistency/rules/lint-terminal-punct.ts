import { publishedSnapshotText, singleKeyGroupId } from '../group-id'
import { publishedWording } from '../text'
import type {
  ConsistencyFinding,
  ConsistencyRule,
  LintIssue,
} from '../types'
import { toMember } from '../types'

/**
 * Terminal punctuation, compared by canonical class so `。` vs `.` is NOT a
 * violation — CJK translations legitimately swap full-width forms. Two real
 * violations: classes that disagree (`Save.` → `保存？`), and a CJK target
 * (zh/ja) dropping the terminal the source had (Weblate's zh/ja rule).
 */

function terminalClass(text: string): string | null {
  const trimmed = text.trimEnd()
  if (!trimmed) return null
  switch (trimmed[trimmed.length - 1]) {
    case '.':
    case '。':
      return 'period'
    case '!':
    case '！':
      return 'exclamation'
    case '?':
    case '？':
      return 'question'
    case '…':
      return 'ellipsis'
    case ';':
    case '；':
      return 'semicolon'
    default:
      return null
  }
}

function isCjkTarget(locale: string): boolean {
  return /^(zh|ja)/.test(locale)
}

export const lintTerminalPunctRule: ConsistencyRule = {
  id: 'lint.terminal-punct',
  defaultSeverity: 'info',
  category: 'lint',
  granularity: 'key',

  detect(ctx): ConsistencyFinding[] {
    if (ctx.lintRules['lint.terminal-punct'] === false) return []

    const findings: ConsistencyFinding[] = []
    for (const key of ctx.keys) {
      const source = publishedWording(key, ctx.sourceLocale)
      const sourceClass = terminalClass(source)
      if (!sourceClass) continue

      const issues: LintIssue[] = []
      for (const row of key.locales) {
        if (row.locale === ctx.sourceLocale) continue
        const text = row.publishedText ?? ''
        if (!text) continue
        const targetClass = terminalClass(text)
        if (targetClass === sourceClass) continue
        if (targetClass === null && !isCjkTarget(row.locale)) continue
        const end = text.trimEnd().length
        issues.push({
          locale: row.locale,
          excerpt: targetClass ?? '(missing)',
          text,
          spans: targetClass ? [[end - 1, end]] : [],
        })
      }
      if (!issues.length) continue

      findings.push({
        ruleId: 'lint.terminal-punct',
        severity: 'info',
        category: 'lint',
        groupId: singleKeyGroupId(
          'lint.terminal-punct',
          key.keyId,
          publishedSnapshotText(key)
        ),
        keys: [toMember(key)],
        meta: { issues, source, sourceClass },
      })
    }
    return findings
  },
}
