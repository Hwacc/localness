import type { LintIssue, MismatchIssue, TextSpan } from './types'

/**
 * Human copy for the report. `hint` answers "why does this rule exist / why
 * should I care"; `describe*` turns one issue row into a sentence. Kept next
 * to the registry so a new rule cannot ship without its explanation
 * (registry test enforces coverage).
 */
export const ruleCopy: Record<string, { label: string; hint: string }> = {
  'duplicate-text': {
    label: 'Duplicate text',
    hint: 'The same source sentence lives under several keys — every translation and copy edit has to be done more than once.',
  },
  placeholders: {
    label: 'Placeholders',
    hint: 'Every placeholder in the source ({name}, %s, {{count}}, linked @:common.save) must appear in each translation, spelled exactly the same — otherwise the app shows the raw token or the wrong value. Reordering with %1$s / %2$s is fine. Plural/select blocks (ICU, vue-i18n `a | b`) are compared by the variables they use, so branch counts may differ per language; i18next plural keys (_one, _other, _few…) are checked as one family, {{count}} optional per form, and a form the source lacks is checked against _other.',
  },
  numbers: {
    label: 'Numbers',
    hint: 'Numbers stated in the source should appear in each translation. Local formatting (1,000 vs 1.000) and words written as digits (January → 1月) are fine; a missing, extra or changed number usually means the user is told something wrong.',
  },
  'urls-emails': {
    label: 'URLs & emails',
    hint: 'Links and email addresses from the source should survive translation unchanged — a dropped or edited one sends users nowhere.',
  },
  'html-tags': {
    label: 'Tags',
    hint: 'Tags in the source — HTML (<b>, <a>, <br/>), rich-text components (<bold>…</bold>) and indexed Trans tags (<0>…</0>, <1/>) — must appear in each translation, opened and closed the same way. A lost, extra or unclosed tag breaks formatting, links or the component it wraps; reordering is fine.',
  },
  'orphan-keys': {
    label: 'Orphan keys',
    hint: 'No frame on any captured design references these keys (an i18next plural form counts as referenced when a sibling form is). Often leftovers — but keys created directly in the dictionary are legitimately frameless.',
  },
  'lint.ellipsis': {
    label: 'Ellipsis',
    hint: 'Three dots "..." render wider and can wrap mid-sequence; the single ellipsis character "…" is the typographic form.',
  },
  'lint.double-space': {
    label: 'Double space',
    hint: 'Consecutive spaces are almost always a typo and render as uneven gaps.',
  },
  'lint.cjk-spacing': {
    label: 'CJK spacing',
    hint: 'Chinese copy conventionally puts a space between Chinese characters and Latin letters or digits (打开 Wi-Fi 设置).',
  },
  'lint.terminal-punct': {
    label: 'Terminal punctuation',
    hint: 'A translation should end the way the source does — a question should stay a question. Full-width and ASCII forms (。/ .) count as the same.',
  },
  'lint.french-spacing': {
    label: 'French spacing',
    hint: 'French puts a narrow no-break space (U+202F) before ! ? ; : — a plain space lets the mark wrap onto its own line.',
  },
}

const TOKEN_NOUN: Record<string, string> = {
  placeholders: 'placeholder',
  numbers: 'number',
  'urls-emails': 'URL / email',
  'html-tags': 'tag',
}

function quoted(tokens: string[]): string {
  return tokens.map((token) => `"${token}"`).join(', ')
}

function plural(noun: string, count: number): string {
  return count === 1 ? noun : `${noun}s`
}

/** e.g. `Has a number the source doesn't: "1"` */
export function describeMismatch(ruleId: string, issue: MismatchIssue): string {
  const noun = TOKEN_NOUN[ruleId] ?? 'token'
  const parts: string[] = []
  if (issue.extra.length) {
    parts.push(
      `Has ${issue.extra.length === 1 ? 'a' : issue.extra.length} ${plural(noun, issue.extra.length)} the source doesn't: ${quoted(issue.extra)}`
    )
  }
  if (issue.missing.length) {
    parts.push(
      `Missing ${issue.missing.length === 1 ? 'a' : issue.missing.length} ${plural(noun, issue.missing.length)} from the source: ${quoted(issue.missing)}`
    )
  }
  return parts.join(' · ')
}

const PUNCT_NAME: Record<string, string> = {
  period: 'a period',
  exclamation: 'an exclamation mark',
  question: 'a question mark',
  ellipsis: 'an ellipsis',
  semicolon: 'a semicolon',
}

export function describeLint(
  ruleId: string,
  issue: LintIssue,
  meta?: Record<string, unknown>
): string {
  switch (ruleId) {
    case 'lint.ellipsis':
      return `Uses "${issue.excerpt}" — write "…" instead`
    case 'lint.double-space':
      return `${issue.excerpt.length} spaces in a row`
    case 'lint.cjk-spacing':
      return `No space between Chinese and Latin/digit: "${issue.excerpt}"`
    case 'lint.french-spacing':
      return `Plain space before "${issue.excerpt.trim()}" — use a narrow no-break space`
    case 'lint.terminal-punct': {
      const source =
        PUNCT_NAME[String(meta?.sourceClass)] ?? String(meta?.sourceClass)
      return issue.excerpt === '(missing)'
        ? `Source ends with ${source}; this translation has no ending punctuation`
        : `Source ends with ${source}; this translation ends with ${PUNCT_NAME[issue.excerpt] ?? issue.excerpt}`
    }
    default:
      return issue.excerpt
  }
}

/** Split `text` into plain / highlighted runs; overlapping spans are merged. */
export function highlightSegments(
  text: string,
  spans: TextSpan[]
): Array<{ text: string; hit: boolean }> {
  const sorted = [...spans]
    .filter(([start, end]) => end > start)
    .sort((a, b) => a[0] - b[0])
  const out: Array<{ text: string; hit: boolean }> = []
  let cursor = 0
  for (const [start, end] of sorted) {
    if (end <= cursor) continue
    const from = Math.max(start, cursor)
    if (from > cursor) out.push({ text: text.slice(cursor, from), hit: false })
    out.push({ text: text.slice(from, end), hit: true })
    cursor = end
  }
  if (cursor < text.length) out.push({ text: text.slice(cursor), hit: false })
  return out
}
