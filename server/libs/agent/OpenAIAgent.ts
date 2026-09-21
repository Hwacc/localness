import type {
  ChatCompletionCreateParamsNonStreaming,
  ChatCompletionMessageParam,
} from 'openai/resources/chat/completions'
import OpenAI, {
  APIConnectionError,
  APIError,
  AuthenticationError,
  NotFoundError,
  PermissionDeniedError,
  RateLimitError,
} from 'openai'
import type { AgentFeature, Env } from './AbstractAgent'
import {
  AbstractAgent,
  AgentError,
  QUOTA_MESSAGE,
  featureEnvSuffix,
  toAgentError,
} from './AbstractAgent'
import { loadAgentPrompt } from './prompt'
import { logAiPayload } from './debug'

/**
 * SiliconFlow serves an OpenAI-compatible endpoint, so the official SDK works
 * with nothing but a different `baseURL`.
 */
const DEFAULT_BASE_URL = 'https://api.siliconflow.cn/v1'
export const DEFAULT_MODEL = 'Qwen/Qwen3.5-4B'

/**
 * Room for the answer alone: the endpoint counts a reasoning chain separately,
 * and the answer here is one small JSON object. The headroom is insurance
 * against a model that decides to explain itself despite the prompt.
 */
const MAX_TOKENS = 4096

/**
 * Every setting comes in two forms: a feature's own, and the shared one it
 * falls back to.
 *
 *   NUXT_OPENAI_<FEATURE>_MODEL  ->  NUXT_OPENAI_MODEL  ->  DEFAULT_MODEL
 *
 * `<FEATURE>` is the agent's slug upper-snake-cased (`i18n-key` -> `I18N_KEY`).
 * Endpoint and credentials are read the same way, so a feature can sit on a
 * provider of its own rather than only on a model of its own.
 */
export function resolveModel(feature: AgentFeature, env: Env = process.env): string {
  const own = env[`NUXT_OPENAI_${featureEnvSuffix(feature)}_MODEL`]?.trim()
  return own || env.NUXT_OPENAI_MODEL?.trim() || DEFAULT_MODEL
}

type ClientConfig = {
  apiKey: string
  baseURL: string
}

export function readClientConfig(
  feature: AgentFeature,
  env: Env = process.env
): ClientConfig | null {
  const suffix = featureEnvSuffix(feature)
  const apiKey =
    env[`NUXT_OPENAI_${suffix}_API_KEY`]?.trim() ||
    env.NUXT_OPENAI_API_KEY?.trim()
  if (!apiKey) return null
  return {
    apiKey,
    baseURL:
      env[`NUXT_OPENAI_${suffix}_BASE_URL`]?.trim() ||
      env.NUXT_OPENAI_BASE_URL?.trim() ||
      DEFAULT_BASE_URL,
  }
}

/**
 * Sampling and decoding knobs. All optional: this layer only forwards them, the
 * feature agent picks the values. The names are ours rather than the wire
 * format, so a feature does not need to know which endpoint it is talking to.
 * 
 * see: https://api-docs.siliconflow.cn/docs/api/chat-completions-post
 */
export type CompletionOptions = {
  /** Defaults to {@link MAX_TOKENS}. */
  maxTokens?: number
  temperature?: number
  topP?: number
  topK?: number
  minP?: number
  frequencyPenalty?: number
  n?: number
  stop?: string | string[]
  reasoningEffort?: 'high' | 'max'
  enableThinking?: boolean
  thinkingBudget?: number
  jsonMode?: boolean
}

/** Everything except `jsonMode`, which is not a field but a translation. */
type TuningOptions = Omit<CompletionOptions, 'jsonMode'>

/**
 * Our knob name -> the field the endpoint expects. Only the ones whose spelling
 * differs need an entry.
 */
const WIRE_FIELD: Record<string, string> = {
  maxTokens: 'max_tokens',
  topP: 'top_p',
  topK: 'top_k',
  minP: 'min_p',
  frequencyPenalty: 'frequency_penalty',
  reasoningEffort: 'reasoning_effort',
  enableThinking: 'enable_thinking',
  thinkingBudget: 'thinking_budget',
}

/**
 * Pure: renames the knobs for the wire and drops the ones nobody set. Kept
 * separate because half of these fields are outside the OpenAI schema, so the
 * object this returns is what gets cast on its way into the SDK.
 */
export function toWireParams(options: TuningOptions): Record<string, unknown> {
  const wire: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(options)) {
    if (value === undefined) continue
    wire[WIRE_FIELD[key] ?? key] = value
  }
  return wire
}

/**
 * These providers signal cause through the status code, which the API layer in
 * turn turns into the status the browser sees.
 */
export function toOpenAIAgentError(error: unknown, model: string): AgentError {
  if (error instanceof AgentError) return error
  if (error instanceof APIConnectionError) {
    return new AgentError(
      'upstream',
      `Could not reach the AI service: ${error.message}`,
      { cause: error }
    )
  }
  if (error instanceof APIError) {
    const message = error.message || 'AI request failed'
    if (QUOTA_MESSAGE.test(message)) {
      return new AgentError('quota', message, { cause: error })
    }
    if (
      error instanceof AuthenticationError ||
      error instanceof PermissionDeniedError
    ) {
      return new AgentError(
        'config',
        `The AI service rejected our API key: ${message}`,
        { cause: error }
      )
    }
    if (error instanceof NotFoundError) {
      return new AgentError(
        'config',
        `Model "${model}" is not available on this endpoint: ${message}`,
        { cause: error }
      )
    }
    if (error instanceof RateLimitError) {
      return new AgentError('quota', message, { cause: error })
    }
    return new AgentError('upstream', message, { cause: error })
  }
  return toAgentError(error, 'AI request failed')
}

/**
 * The transport half of an agent: which endpoint to call, which model this
 * feature uses, and turning provider failures into {@link AgentError}s. What
 * goes into the messages and how the answer is read belongs to the subclasses.
 */
export abstract class OpenAIAgent extends AbstractAgent {
  private apiClient: OpenAI | undefined

  // The SDK throws from its constructor when the key is empty, so building it
  // eagerly would take the server down at import time on a deployment that has
  // no AI key configured.
  private initClient(env: Env): OpenAI {
    if (!this.apiClient) {
      const config = readClientConfig(this.feature, env)
      if (!config) {
        throw new AgentError(
          'config',
          `No API key for the "${this.feature}" agent: set NUXT_OPENAI_${featureEnvSuffix(this.feature)}_API_KEY or NUXT_OPENAI_API_KEY`,
        )
      }
      this.apiClient = new OpenAI({
        apiKey: config.apiKey,
        baseURL: config.baseURL,
      })
    }
    return this.apiClient
  }

  /** The system prompt is a file, not code: `<NUXT_PROMPTS_DIR>/<feature>.md`. */
  protected async systemPrompt(env: Env = process.env): Promise<string> {
    return loadAgentPrompt(this.feature, env)
  }

  /**
   * The one place that talks to the model. Returns the assistant text; an
   * answer that never arrived is an error, not an empty string.
   *
   * Every call logs one summary line — model, knobs, latency, and how much
   * thinking vs answer came back — because that is what a reasoning budget is
   * traded against. Payloads are logged only with `NUXT_AI_DEBUG` set.
   */
  protected async complete(
    messages: ChatCompletionMessageParam[],
    options: CompletionOptions = {},
    env: Env = process.env
  ): Promise<string> {
    const { jsonMode = true, ...rest } = options
    const maxTokens = rest.maxTokens ?? MAX_TOKENS
    const model = resolveModel(this.feature, env)
    const knobs = toWireParams({ ...rest, maxTokens })
    const started = Date.now()
    try {
      const params = {
        model,
        messages,
        ...knobs,
        ...(jsonMode
          ? { response_format: { type: 'json_object' as const } }
          : {}),
      } as ChatCompletionCreateParamsNonStreaming
      const completion = await this.initClient(env).chat.completions.create(
        params
      )
      const choice = completion.choices[0]
      const content = choice?.message?.content?.trim()
      // The chain of thought comes back beside `content`; the OpenAI SDK does
      // not declare the field, so it is read defensively.
      const reasoning = (
        choice?.message as { reasoning_content?: string } | undefined
      )?.reasoning_content?.trim()
      console.log(
        `[agent:${this.feature}] ${model} ${Date.now() - started}ms ${JSON.stringify(knobs)}` +
          ` answer=${content?.length ?? 0}c` +
          (reasoning ? ` thinking=${reasoning.length}c` : '')
      )
      logAiPayload('messages', messages, env)
      logAiPayload('reasoning', reasoning ?? '(none)', env)
      logAiPayload('answer', content ?? '(empty)', env)
      if (!content) {
        throw new AgentError(
          'upstream',
          choice?.finish_reason === 'length'
            ? `The model hit max_tokens (${maxTokens}) before answering`
            : reasoning
              ? // A known shape when thinking is on: the budget went into the
                // chain of thought and the answer never came. Saying "empty
                // answer" here would hide the one fact worth knowing.
                `The model produced ${reasoning.length} chars of reasoning but no answer`
              : 'The AI service returned an empty answer'
        )
      }
      return content
    } catch (error) {
      console.error(`[agent:${this.feature}] request failed:`, error)
      throw toOpenAIAgentError(error, model)
    }
  }
}
