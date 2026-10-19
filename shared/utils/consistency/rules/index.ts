import type {
  ConsistencyFinding,
  ConsistencyRule,
  FindingCategory,
  ScanContext,
} from '../types'
import { duplicateTextRule } from './duplicate-text'
import { placeholdersRule } from './placeholders'
import { numbersRule } from './numbers'
import { urlsEmailsRule } from './urls-emails'
import { htmlTagsRule } from './html-tags'
import { orphanKeysRule } from './orphan-keys'
import { lintEllipsisRule } from './lint-ellipsis'
import { lintDoubleSpaceRule } from './lint-double-space'
import { lintCjkSpacingRule } from './lint-cjk-spacing'
import { lintTerminalPunctRule } from './lint-terminal-punct'
import { lintFrenchSpacingRule } from './lint-french-spacing'

/** Registry order = report order. Adding a rule is one entry here. */
export const allRules: ConsistencyRule[] = [
  duplicateTextRule,
  placeholdersRule,
  numbersRule,
  urlsEmailsRule,
  htmlTagsRule,
  orphanKeysRule,
  lintEllipsisRule,
  lintDoubleSpaceRule,
  lintCjkSpacingRule,
  lintTerminalPunctRule,
  lintFrenchSpacingRule,
]

/** Presentation labels for the lint switches in project settings. */
export const lintRuleCatalog: Array<{ id: string; label: string }> = [
  { id: 'lint.ellipsis', label: 'Ellipsis ("..." → "…")' },
  { id: 'lint.double-space', label: 'Double space' },
  { id: 'lint.cjk-spacing', label: 'CJK spacing' },
  { id: 'lint.terminal-punct', label: 'Terminal punctuation' },
  { id: 'lint.french-spacing', label: 'French spacing' },
]

export const categorySections: Record<
  FindingCategory,
  { title: string; description: string }
> = {
  duplicate: {
    title: 'Duplicate text',
    description:
      'The same source sentence saved under different keys, across every captured design.',
  },
  mismatch: {
    title: 'Source ↔ translation',
    description:
      'Published translations whose placeholders, numbers, URLs or tags disagree with the source — what users see break.',
  },
  lint: {
    title: 'Lint',
    description:
      'Style suggestions for published copy: ellipsis, spacing, terminal punctuation.',
  },
  orphan: {
    title: 'Orphan keys',
    description:
      'Dictionary entries no frame references — leftovers from deleted designs or manual creation.',
  },
}

export function detectAll(ctx: ScanContext): ConsistencyFinding[] {
  return allRules.flatMap((rule) => rule.detect(ctx))
}
