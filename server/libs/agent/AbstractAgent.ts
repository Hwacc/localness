/**
 * Why the agent call failed, so the API layer can pick an HTTP status instead of
 * letting every upstream hiccup surface as an opaque 500.
 * - `quota`: the AI provider refused on billing/credits/rate grounds
 * - `upstream`: the provider is reachable but the call failed
 * - `config`: our own credentials, model or prompt files are broken
 * - `bad-params`: the agent was called without usable parameters
 */
export type AgentErrorKind = 'quota' | 'upstream' | 'config' | 'bad-params'

export class AgentError extends Error {
  readonly kind: AgentErrorKind

  constructor(kind: AgentErrorKind, message: string, options?: ErrorOptions) {
    super(message, options)
    this.name = 'AgentError'
    this.kind = kind
  }
}

/**
 * Which feature an agent serves. The slug drives both the per-feature settings
 * (`NUXT_OPENAI_<SUFFIX>_*`) and the prompt file (`<feature>.md`), so adding a
 * feature needs a subclass, a slug here and a Markdown file — no new
 * configuration code.
 */
export type AgentFeature = 'i18n-key'

/** `i18n-key` -> `I18N_KEY`. */
export function featureEnvSuffix(feature: AgentFeature): string {
  return feature.toUpperCase().replace(/-/g, '_')
}

/** Read-only view of the environment, so config resolution stays testable. */
export type Env = Record<string, string | undefined>

/**
 * Providers report a billing or credit refusal as free text rather than a status
 * code, so the kind has to be sniffed out of the message.
 */
export const QUOTA_MESSAGE = /insufficient|credit|balance|quota|rate limit/i

export function toAgentError(error: unknown, fallback: string): AgentError {
  if (error instanceof AgentError) return error
  const message = error instanceof Error ? error.message : String(error)
  return new AgentError('upstream', message || fallback, { cause: error })
}

export abstract class AbstractAgent {
  abstract readonly feature: AgentFeature
}
