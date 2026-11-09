import type { ChatCompletionMessageParam } from 'openai/resources/chat/completions'
import { AgentError } from './AbstractAgent'
import { extractJson } from './I18nKeyGenerateAgent'
import { logAiPayload } from './debug'
import { OpenAIAgent } from './OpenAIAgent'

export type TranslationItem = {
  /** Ours to match the answer back with; never a position. */
  id: string
  source: string
  /** Context for the model only; it is never part of the answer. */
  key?: string
  context?: string
  /** The same text in other locales, for terminology only. */
  other?: Record<string, string>
}

export type TranslationParams = {
  sourceLocale: string
  targetLocale: string
  items: TranslationItem[]
}

/** `text` is null when the model returned nothing usable for the item. */
export type TranslationResult = {
  id: string
  text: string | null
}

/** Pure: the user turn, i.e. everything except the system prompt. */
export function buildTranslationUserTurn(
  params: TranslationParams,
): ChatCompletionMessageParam {
  const items = params.items.map(({ id, source, key, context, other }) => ({
    id,
    source,
    key: key?.trim() || undefined,
    context: context?.trim() || undefined,
    other: other && Object.keys(other).length ? other : undefined,
  }))
  return {
    role: 'user',
    content: [
      `Source locale: ${params.sourceLocale}`,
      `Target locale: ${params.targetLocale}`,
      `Items:\n${JSON.stringify(items)}`,
    ].join('\n'),
  }
}

/** Models sometimes answer a number where the prompt sent a string id. */
function idOf(value: unknown): string | null {
  if (typeof value === 'string') return value
  if (typeof value === 'number') return String(value)
  return null
}

/**
 * Matches the answer back to the items by `id`, never by position: a model that
 * skips, reorders or repeats an item must not shift the text of its neighbours.
 *
 * The result has exactly one entry per input item, in input order. An item the
 * model left out, answered with a non-string or blanked is `text: null`, so one
 * bad item costs one item rather than the whole block. Unknown ids are ignored
 * and the first answer for an id wins. Only an answer that is not JSON at all
 * throws.
 *
 * An item whose source is blank may come back blank: the prompt says to return
 * such text unchanged.
 */
export function parseTranslationContent(
  content: string,
  items: TranslationItem[],
): TranslationResult[] {
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

  const answers = new Map<string, string>()
  for (const entry of Array.isArray(parsed) ? parsed : [parsed]) {
    if (!entry || typeof entry !== 'object') continue
    const { id, text } = entry as { id?: unknown; text?: unknown }
    const key = idOf(id)
    if (key === null || typeof text !== 'string' || answers.has(key)) continue
    answers.set(key, text)
  }

  return items.map(({ id, source }) => {
    const text = answers.get(id)
    if (text === undefined) return { id, text: null }
    if (!text.trim() && source.trim()) return { id, text: null }
    return { id, text }
  })
}

const JSON_ESCAPES: Record<string, string> = {
  n: '\n',
  t: '\t',
  r: '\r',
  b: '\b',
  f: '\f',
}

/**
 * Feeds on the raw JSON the model writes and returns the newly decoded part of
 * the first `"text"` string value, so a single translation can be shown as it is
 * written instead of as `[{"id":"1","text":"…`. Chunks can cut an escape in half;
 * the unfinished part is held back until the next chunk. Once the closing quote
 * has gone by it returns nothing more.
 */
export function createTextFieldExtractor(): (chunk: string) => string {
  let head = ''
  let inValue = false
  let done = false
  let pending = ''
  return (chunk) => {
    if (done) return ''
    let rest = chunk
    if (!inValue) {
      head += chunk
      const match = /"text"\s*:\s*"/.exec(head)
      if (!match) return ''
      inValue = true
      rest = head.slice(match.index + match[0].length)
      head = ''
    }
    const input = pending + rest
    pending = ''
    let out = ''
    for (let i = 0; i < input.length; i++) {
      const char = input[i]!
      if (char === '"') {
        done = true
        break
      }
      if (char !== '\\') {
        out += char
        continue
      }
      const next = input[i + 1]
      if (next === undefined) {
        pending = input.slice(i)
        break
      }
      if (next === 'u') {
        const hex = input.slice(i + 2, i + 6)
        if (hex.length < 4) {
          pending = input.slice(i)
          break
        }
        out += String.fromCharCode(Number.parseInt(hex, 16))
        i += 5
        continue
      }
      out += JSON_ESCAPES[next] ?? next
      i++
    }
    return out
  }
}

export class TranslationAgent extends OpenAIAgent {
  readonly feature = 'translation'

  private async messages(
    params: TranslationParams,
  ): Promise<ChatCompletionMessageParam[]> {
    if (!params.items.length) {
      throw new AgentError('bad-params', 'There is nothing to translate')
    }
    return [
      { role: 'system', content: await this.systemPrompt() },
      buildTranslationUserTurn(params),
    ]
  }

  // Low temperature and no reasoning: this is faithful rewriting, and thinking
  // only adds latency and cost per block.
  private static readonly OPTIONS = {
    temperature: 0.2,
    enableThinking: false,
    n: 1,
  }

  /** One result per item, in input order; see {@link parseTranslationContent}. */
  public async translate(
    params: TranslationParams,
  ): Promise<TranslationResult[]> {
    const content = await this.complete(
      await this.messages(params),
      TranslationAgent.OPTIONS,
    )
    const results = parseTranslationContent(content, params.items)
    logAiPayload('parsed', results)
    return results
  }

  /**
   * One item, written out as the model produces it. Yields the translation
   * text only; the caller joins the pieces. Ends with an error rather than an
   * empty string when the answer carried no text.
   */
  public async *translateStream(
    params: TranslationParams,
  ): AsyncGenerator<string, void> {
    if (params.items.length !== 1) {
      throw new AgentError(
        'bad-params',
        'Streaming translates exactly one item at a time',
      )
    }
    const extract = createTextFieldExtractor()
    let yielded = false
    for await (const chunk of this.stream(
      await this.messages(params),
      TranslationAgent.OPTIONS,
    )) {
      const text = extract(chunk)
      if (!text) continue
      yielded = true
      yield text
    }
    if (!yielded && params.items[0]!.source.trim()) {
      throw new AgentError(
        'upstream',
        'The AI service answered without a translation',
      )
    }
  }
}
