import fs from 'node:fs'
import path from 'node:path'
import type { ZGenI18nKey } from '#shared/utils/schemas'

class SecretAssistant {
  private filename!: string

  private readSecret() {
    if (!this.filename) {
      throw new Error('Secret filename is required')
    }
    const secret = fs.readFileSync(
      path.resolve(process.cwd(), `./server/secrets/${this.filename}.json`),
      'utf8'
    )
    return JSON.parse(secret)
  }

  public getSecret<T>(filename: string) {
    this.filename = filename
    return this.readSecret() as T
  }
}

/**
 * Why the agent call failed, so the API layer can pick an HTTP status instead of
 * letting every upstream hiccup surface as an opaque 500.
 * - `quota`: the AI provider refused on billing/credits/rate grounds
 * - `upstream`: the provider is reachable but the run failed
 * - `config`: our own credentials / client setup is broken
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

export type JWTResult = {
  token_type: string
  access_token: string
  refresh_token: string
  expires_in: number
}
export abstract class AbstractAgent {
  protected secretAssistant = new SecretAssistant()
  abstract getJwt(): Promise<JWTResult>
  abstract isExpired(): boolean
  abstract generateI18nKey<T>(): Promise<T>
  // eslint-disable-next-line @typescript-eslint/unified-signatures
  abstract generateI18nKey<T>(parmas?: ZGenI18nKey): Promise<T>
}
