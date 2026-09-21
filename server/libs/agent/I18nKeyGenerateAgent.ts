import type { ChatCompletionMessageParam } from 'openai/resources/chat/completions'
import type { AgentI18nKeyResult } from '#shared/types'
import type { ZGenI18nKey } from '#shared/utils/schemas'
import type { KeyConvention } from '#shared/utils/key-convention'
import { checkI18nKey } from '#shared/utils/key-convention'
import { AgentError } from './AbstractAgent'
import { OpenAIAgent } from './OpenAIAgent'

/** The convention comes from the project row, never from the request body. */
export type I18nKeyGenerateParams = ZGenI18nKey & { convention: KeyConvention }

function guidance(label: string, value: string | null | undefined) {
  const text = value?.trim()
  return text ? `${label}:\n${text}` : null
}

/** Spelled out one key per line so a blank prefix reads as "none", not "unset". */
function conventionBlock(convention: KeyConvention): string {
  return [
    'Key convention:',
    `prefix: ${convention.prefix || '(none)'}`,
    `separator: ${convention.separator}`,
    `casing: ${convention.style}`,
    `max depth: ${convention.maxDepth}`,
  ].join('\n')
}

/**
 * Pure: the user turn, i.e. everything except the system prompt.
 *
 * Only the guidance, the convention and the text go in. The tag id is
 * deliberately absent: it is ours to stamp on the answer, so the model is never
 * told which tag it is naming.
 */
export function buildI18nKeyUserTurn(
  params: I18nKeyGenerateParams,
): ChatCompletionMessageParam {
  const prompt = [
    guidance('Project guidance', params.projectPrompt),
    guidance('Page guidance', params.pagePrompt),
    guidance('Tag guidance', params.tagPrompt),
    conventionBlock(params.convention),
    guidance('Text', params.tagOrigin),
  ]
    .filter((section) => section !== null)
    .join('\n\n')

  return { role: 'user', content: prompt }
}

/**
 * The first complete `{...}` or `[...]` in `text`, ignoring whatever a chatty
 * model put around it.
 *
 * It has to *balance* the outer container rather than slice between the first
 * and last delimiter. A bare object holding an `alternatives` array would
 * otherwise be read as that inner array, and the key sitting next to it never
 * seen. Strings are tracked so a brace inside a value cannot throw off the
 * count.
 */
export function extractJson(text: string): string | null {
  const brace = text.indexOf('{')
  const bracket = text.indexOf('[')
  if (brace === -1 && bracket === -1) return null
  // Whichever opens first is the container; the other can only be nested.
  const useBrace = bracket === -1 || (brace !== -1 && brace < bracket)
  const start = useBrace ? brace : bracket
  const open = useBrace ? '{' : '['
  const close = useBrace ? '}' : ']'
  let depth = 0
  let inString = false
  let escaped = false
  for (let i = start; i < text.length; i++) {
    const char = text[i]
    if (inString) {
      if (escaped) escaped = false
      else if (char === '\\') escaped = true
      else if (char === '"') inString = false
      continue
    }
    if (char === '"') inString = true
    else if (char === open) depth++
    else if (char === close && --depth === 0) return text.slice(start, i + 1)
  }
  return null
}

/**
 * The platform guarantees valid JSON but not our fields, and models still wrap
 * the payload in prose or fences often enough to be worth stripping.
 *
 * The prompt asks for an array even for a single line, so batch support later
 * becomes a change of how many lines go in rather than a change of shape. Only
 * the first item is read here. A bare object is accepted as a one-item array —
 * the shape is the prompt's job to get right, and the validator below is what
 * catches a key that ignores the convention.
 *
 * The tag id is stamped from the request rather than read from the answer: the
 * model was never given one, so an id in its reply could only be invented.
 */
export function parseI18nKeyContent(
  content: string,
  tagID: number,
  convention: KeyConvention,
): AgentI18nKeyResult {
  let parsed: unknown
  try {
    const json = extractJson(content)
    if (!json) throw new SyntaxError('no JSON found')
    parsed = JSON.parse(json)
  } catch (error) {
    throw new AgentError(
      'upstream',
      `The AI service did not answer with JSON: ${content.slice(0, 200)}`,
      { cause: error },
    )
  }

  const item: unknown = Array.isArray(parsed) ? parsed[0] : parsed
  if (!item || typeof item !== 'object') {
    throw new AgentError(
      'upstream',
      `The AI service answered with no key: ${content.slice(0, 200)}`,
    )
  }

  const record = item as Partial<AgentI18nKeyResult>
  // A missing `key` is a broken answer; an *empty* one is the documented answer
  // for a line with nothing to name. Treating the two alike would let a
  // malformed reply pass as "cannot name".
  if (typeof record.key !== 'string') {
    throw new AgentError(
      'upstream',
      `The AI service answered without a key: ${content.slice(0, 200)}`,
    )
  }
  const key = record.key.trim()
  return {
    tag_id: tagID,
    source: typeof record.source === 'string' ? record.source : '',
    key,
    confidence:
      typeof record.confidence === 'number' ? record.confidence : undefined,
    alternatives: Array.isArray(record.alternatives)
      ? record.alternatives.filter(
          (one): one is string => typeof one === 'string',
        )
      : undefined,
    reason: typeof record.reason === 'string' ? record.reason : undefined,
    // An empty key is a documented answer (nothing in the line to name), so it
    // reports no violations — the UI tells that story with its own state.
    violations: checkI18nKey(key, convention),
  }
}

export class I18nKeyGenerateAgent extends OpenAIAgent {
  readonly feature = 'i18n-key'

  public async generateI18nKey(
    params: I18nKeyGenerateParams,
  ): Promise<AgentI18nKeyResult> {
    const messages: ChatCompletionMessageParam[] = [
      { role: 'system', content: await this.systemPrompt() },
      buildI18nKeyUserTurn(params),
    ]
    const content = await this.complete(messages, {
      temperature: 0.35,
      topK: 20,
      frequencyPenalty: 0,
      enableThinking: false,
      n: 1,
    })
    return parseI18nKeyContent(content, params.tagID, params.convention)
  }
}
