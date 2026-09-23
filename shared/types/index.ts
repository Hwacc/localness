import type { KeyViolation } from '../utils/key-convention'

export type ID = string | number

export type ImageCache = {
  url: string
  deadline: number
}

/** One naming option: the model's pick, or one of its alternatives. */
export interface I18nKeyCandidate {
  key: string
  confidence?: number
}

/**
 * A candidate that already exists in the project's vocabulary.
 *
 * Sharing a key between tags is intended — that is how one entry serves several
 * boxes — so "already exists" alone says nothing. The comparison decides.
 */
export interface I18nKeyDuplicate {
  key: string
  /** The text that key already translates. */
  sourceText: string
  /** Same text as the one being named: a reuse, not a clash. */
  sameSourceText: boolean
}

/**
 * One generated key, shaped the way the prompt asks for it (see
 * `server/prompts/i18n-key.md`). `key` is empty when the source text has no
 * nameable content — that is a documented answer, not a failure.
 */
export interface I18nKeySuggestion {
  /** The source line, echoed back by the model. */
  source: string
  key: string
  confidence?: number
  /** Ordered best-first; each carries its own score. */
  alternatives?: I18nKeyCandidate[]
  reason?: string
  /** Checked on the server rather than trusted: the rules only live in the prompt. */
  violations: KeyViolation[]
  /** Which candidates this project already has. Filled by the route, not the agent. */
  duplicates: I18nKeyDuplicate[]
}

/**
 * The agent's half: it knows the convention, not the project's key list, and
 * not which tag (if any) the call came from — an entry-scoped call has no tag
 * at all, so the identity is composed by whoever made the call.
 */
export type AgentI18nKeyResult = Omit<I18nKeySuggestion, 'duplicates'>
