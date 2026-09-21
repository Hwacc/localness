import type { KeyViolation } from '../utils/key-convention'

export type ID = string | number

export type ImageCache = {
  url: string
  deadline: number
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
  /** Ordered best-first; no per-candidate score. */
  alternatives?: string[]
  reason?: string
  /** Checked on the server rather than trusted: the rules only live in the prompt. */
  violations: KeyViolation[]
}

export interface AgentI18nKeyResult extends I18nKeySuggestion {
  tag_id: number
}
