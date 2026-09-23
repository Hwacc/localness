import { mkdtemp, rm, utimes, writeFile } from 'node:fs/promises'
import { createServer, type Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  APIConnectionError,
  AuthenticationError,
  BadRequestError,
  NotFoundError,
  RateLimitError,
} from 'openai'
import type { KeyConvention } from '#shared/utils/key-convention'
import { DEFAULT_KEY_CONVENTION } from '#shared/utils/key-convention'
import { AgentError } from '#server/libs/agent/AbstractAgent'
import { isAiDebug } from '#server/libs/agent/debug'
import type { I18nKeyGenerateParams } from '#server/libs/agent/I18nKeyGenerateAgent'
import {
  I18nKeyGenerateAgent,
  buildI18nKeyUserTurn,
  extractJson,
  parseI18nKeyContent,
} from '#server/libs/agent/I18nKeyGenerateAgent'
import {
  DEFAULT_MODEL,
  readClientConfig,
  resolveModel,
  toOpenAIAgentError,
  toWireParams,
} from '#server/libs/agent/OpenAIAgent'
import { loadAgentPrompt, promptsDir } from '#server/libs/agent/prompt'

const CONVENTION: KeyConvention = { ...DEFAULT_KEY_CONVENTION, prefix: 'demo' }

const BASE: I18nKeyGenerateParams = {
  projectPrompt: null,
  pagePrompt: null,
  pageImage: null,
  tagSourceText: 'Sign in',
  tagI18nKey: null,
  tagPrompt: null,
  convention: CONVENTION,
}

const headers = new Headers()

/** Where `pnpm dev` finds the prompts, i.e. the repository's own copy. */
const REPO_PROMPTS = promptsDir({})

function tempPromptsDir() {
  return mkdtemp(join(tmpdir(), 'localness-prompts-'))
}

/** Pushes mtime forward so a rewrite cannot be missed by the cache. */
function touchLater(file: string) {
  const later = new Date(Date.now() + 5000)
  return utimes(file, later, later)
}

describe('isAiDebug', () => {
  it('is off unless asked for', () => {
    // Payload logs carry the project's own UI text, so the default has to be
    // silent rather than talkative.
    expect(isAiDebug({})).toBe(false)
    expect(isAiDebug({ NUXT_AI_DEBUG: '' })).toBe(false)
    expect(isAiDebug({ NUXT_AI_DEBUG: '0' })).toBe(false)
    expect(isAiDebug({ NUXT_AI_DEBUG: 'no' })).toBe(false)
  })

  it('accepts the usual ways of saying yes', () => {
    for (const value of ['1', 'true', 'TRUE', ' yes ']) {
      expect(isAiDebug({ NUXT_AI_DEBUG: value })).toBe(true)
    }
  })
})

describe('resolveModel', () => {
  it("prefers the feature's own model", () => {
    expect(
      resolveModel('i18n-key', {
        NUXT_OPENAI_MODEL: 'shared-model',
        NUXT_OPENAI_I18N_KEY_MODEL: 'feature-model',
      })
    ).toBe('feature-model')
  })

  it('falls back to the shared model', () => {
    expect(resolveModel('i18n-key', { NUXT_OPENAI_MODEL: 'shared-model' })).toBe(
      'shared-model'
    )
  })

  it('falls back to the default when nothing is set', () => {
    expect(resolveModel('i18n-key', {})).toBe(DEFAULT_MODEL)
  })

  it('ignores blank values rather than using them', () => {
    expect(
      resolveModel('i18n-key', {
        NUXT_OPENAI_MODEL: '  ',
        NUXT_OPENAI_I18N_KEY_MODEL: '  ',
      })
    ).toBe(DEFAULT_MODEL)
  })
})

describe('readClientConfig', () => {
  it('reads the shared endpoint and key', () => {
    expect(
      readClientConfig('i18n-key', {
        NUXT_OPENAI_API_KEY: 'shared-key',
        NUXT_OPENAI_BASE_URL: 'https://shared.test/v1',
      })
    ).toEqual({ apiKey: 'shared-key', baseURL: 'https://shared.test/v1' })
  })

  it('lets a feature bring a whole provider of its own', () => {
    expect(
      readClientConfig('i18n-key', {
        NUXT_OPENAI_API_KEY: 'shared-key',
        NUXT_OPENAI_BASE_URL: 'https://shared.test/v1',
        NUXT_OPENAI_I18N_KEY_API_KEY: 'own-key',
        NUXT_OPENAI_I18N_KEY_BASE_URL: 'https://own.test/v1',
      })
    ).toEqual({ apiKey: 'own-key', baseURL: 'https://own.test/v1' })
  })

  it('mixes a feature key with the shared endpoint', () => {
    // Each knob falls back on its own, so half a feature override still works.
    expect(
      readClientConfig('i18n-key', {
        NUXT_OPENAI_API_KEY: 'shared-key',
        NUXT_OPENAI_BASE_URL: 'https://shared.test/v1',
        NUXT_OPENAI_I18N_KEY_API_KEY: 'own-key',
      })
    ).toEqual({ apiKey: 'own-key', baseURL: 'https://shared.test/v1' })
  })

  it('falls back to the endpoint the transport is written for', () => {
    expect(
      readClientConfig('i18n-key', { NUXT_OPENAI_API_KEY: 'shared-key' })
    ).toEqual({
      apiKey: 'shared-key',
      baseURL: 'https://api.siliconflow.cn/v1',
    })
  })

  it('reports nothing at all when no key is set', () => {
    expect(
      readClientConfig('i18n-key', { NUXT_OPENAI_I18N_KEY_BASE_URL: 'https://x' })
    ).toBeNull()
  })
})

describe('toWireParams', () => {
  it('drops every knob nobody set', () => {
    expect(toWireParams({})).toEqual({})
  })

  it('renames the knobs whose wire spelling differs', () => {
    expect(
      toWireParams({
        maxTokens: 256,
        temperature: 0,
        topP: 0.9,
        topK: 40,
        minP: 0.05,
        frequencyPenalty: 0.5,
        reasoningEffort: 'max',
        enableThinking: false,
        thinkingBudget: 512,
      })
    ).toEqual({
      max_tokens: 256,
      temperature: 0,
      top_p: 0.9,
      top_k: 40,
      min_p: 0.05,
      frequency_penalty: 0.5,
      reasoning_effort: 'max',
      enable_thinking: false,
      thinking_budget: 512,
    })
  })

  it('keeps the names that already match the wire', () => {
    expect(toWireParams({ n: 2, stop: ['\n'] })).toEqual({ n: 2, stop: ['\n'] })
  })

  it('keeps a set value that merely looks falsy', () => {
    // `temperature: 0` is the whole reason for setting it, so a truthiness
    // check here would silently drop exactly the values that matter.
    expect(toWireParams({ temperature: 0, enableThinking: false })).toEqual({
      temperature: 0,
      enable_thinking: false,
    })
  })
})

describe('buildI18nKeyUserTurn', () => {
  it('carries the text', () => {
    expect(JSON.stringify(buildI18nKeyUserTurn(BASE))).toContain('Sign in')
  })

  it('spells the convention out', () => {
    const payload = JSON.stringify(buildI18nKeyUserTurn(BASE))

    expect(payload).toContain('Key convention')
    expect(payload).toContain('prefix: demo')
    expect(payload).toContain('separator: _')
    expect(payload).toContain('casing: snake_case')
    expect(payload).toContain('max depth: 4')
  })

  it('says none rather than leaving the prefix blank', () => {
    const payload = JSON.stringify(
      buildI18nKeyUserTurn({ ...BASE, convention: DEFAULT_KEY_CONVENTION })
    )

    expect(payload).toContain('prefix: (none)')
  })

  it('omits every piece of guidance the caller did not set', () => {
    const payload = JSON.stringify(buildI18nKeyUserTurn(BASE))

    expect(payload).not.toContain('Project guidance')
    expect(payload).not.toContain('Page guidance')
    expect(payload).not.toContain('Tag guidance')
  })

  it('includes each level of guidance that is set, trimmed', () => {
    const payload = JSON.stringify(
      buildI18nKeyUserTurn({
        ...BASE,
        projectPrompt: '  Use the design system vocabulary.  ',
        pagePrompt: 'Checkout page.',
        tagPrompt: 'Submit button.',
      })
    )

    expect(payload).toContain('Use the design system vocabulary.')
    expect(payload).not.toContain('  Use the design system')
    expect(payload).toContain('Checkout page.')
    expect(payload).toContain('Submit button.')
  })

  it('never carries the tag id, the current key or an image', () => {
    // The id is ours to stamp on the answer, and the other two are inputs the
    // model does not get: anything it echoed back would be noise or invention.
    const payload = JSON.stringify(
      buildI18nKeyUserTurn({
        ...BASE,
        tagI18nKey: 'checkout.submit',
        pageImage: 'AAAA',
      })
    )

    expect(payload).not.toContain('tag_id')
    expect(payload).not.toContain('Current key')
    expect(payload).not.toContain('checkout.submit')
    expect(payload).not.toContain('image_url')
    expect(payload).not.toContain('base64')
  })
})

describe('extractJson', () => {
  it('takes the outermost value, not an array nested inside it', () => {
    expect(extractJson('{"a":[1,2]}')).toBe('{"a":[1,2]}')
    expect(extractJson('[{"a":1}]')).toBe('[{"a":1}]')
  })

  it('ignores prose and fences around the value', () => {
    expect(extractJson('Here:\n```json\n[{"a":1}]\n```\nDone.')).toBe(
      '[{"a":1}]'
    )
  })

  it('is not fooled by a delimiter inside a string', () => {
    expect(extractJson('{"a":"}"}')).toBe('{"a":"}"}')
    expect(extractJson('{"a":"["}')).toBe('{"a":"["}')
  })

  it('returns nothing when there is no complete container', () => {
    expect(extractJson('{"a":1')).toBeNull()
    expect(extractJson('I cannot help with that.')).toBeNull()
  })
})

describe('parseI18nKeyContent', () => {
  it('reads the first item of the array', () => {
    const content = JSON.stringify([
      {
        source: 'Sign in',
        key: 'demo_auth_signin_btn',
        confidence: 0.9,
        alternatives: [{ key: 'demo_auth_login_btn', confidence: 0.8 }],
        reason: 'Sign-in button',
      },
      { source: 'second line', key: 'demo_other_btn' },
    ])

    expect(parseI18nKeyContent(content, CONVENTION)).toEqual({
      source: 'Sign in',
      key: 'demo_auth_signin_btn',
      confidence: 0.9,
      alternatives: [{ key: 'demo_auth_login_btn', confidence: 0.8 }],
      reason: 'Sign-in button',
      violations: [],
    })
  })

  it('reads through markdown fences and surrounding prose', () => {
    const content =
      'Sure:\n```json\n[{"source":"Sign in","key":"demo_auth_btn"}]\n```\nDone.'

    expect(parseI18nKeyContent(content, CONVENTION).key).toBe(
      'demo_auth_btn'
    )
  })

  it('accepts a bare object as a one-item answer', () => {
    expect(
      parseI18nKeyContent('{"source":"Sign in","key":"demo_auth_btn"}', CONVENTION)
        .key
    ).toBe('demo_auth_btn')
  })

  it('reads a bare object that carries a nested array of its own', () => {
    // Regression: the `[` of `alternatives` was mistaken for the outer
    // container, so the slice became the alternatives list and the key beside
    // it was never seen — a 502 on a perfectly good answer.
    const content = JSON.stringify({
      source: 'YOU MIGHT BE INTERESTED IN:',
      key: 'demo_common_interests_title',
      confidence: 0.9,
      alternatives: [{ key: 'demo_common_interests_prompt', confidence: 0.8 }],
      reason: 'Section heading above a list',
    })

    expect(parseI18nKeyContent(content, CONVENTION)).toEqual({
      source: 'YOU MIGHT BE INTERESTED IN:',
      key: 'demo_common_interests_title',
      confidence: 0.9,
      alternatives: [{ key: 'demo_common_interests_prompt', confidence: 0.8 }],
      reason: 'Section heading above a list',
      violations: [],
    })
  })

  it('reads plain-string alternatives from a model that ignored the shape', () => {
    // The prompt asks for `{key, confidence}` objects, but a bare string still
    // names a usable key — and anything naming nothing is dropped.
    const alternatives = parseI18nKeyContent(
      '{"key":"demo_a_btn","alternatives":["demo_b_btn",{"key":"demo_c_btn","confidence":0.7},"",42,null]}',
      CONVENTION
    ).alternatives

    expect(alternatives?.map((one) => one.key)).toEqual([
      'demo_b_btn',
      'demo_c_btn',
    ])
    expect(alternatives?.[0].confidence).toBeUndefined()
    expect(alternatives?.[1].confidence).toBe(0.7)
  })

  it('is not confused by brackets used inside a value', () => {
    expect(
      parseI18nKeyContent(
        '{"key":"demo_a_btn","reason":"use [x] and {y} literally"}',
        CONVENTION
      ).reason
    ).toBe('use [x] and {y} literally')
  })

  it('trims the key', () => {
    expect(
      parseI18nKeyContent('{"key":"  demo_auth_btn  "}', CONVENTION).key
    ).toBe('demo_auth_btn')
  })

  it('takes an empty key as the documented answer for an unnameable line', () => {
    const result = parseI18nKeyContent(
      '[{"source":"！！！","key":"","confidence":0,"reason":"symbols only"}]',
      CONVENTION
    )

    expect(result.key).toBe('')
    expect(result.violations).toEqual([])
  })

  it('reports convention violations instead of rejecting the key', () => {
    const result = parseI18nKeyContent('{"key":"auth_Login-Btn"}', CONVENTION)

    expect(result.key).toBe('auth_Login-Btn')
    expect(result.violations).toEqual(
      expect.arrayContaining(['prefix', 'charset', 'case'])
    )
  })

  it('rejects an answer whose key field is not a string', () => {
    // A missing key is a broken answer; an empty one is a legitimate answer.
    // Reading the two alike would let a malformed reply pass as "cannot name".
    expect(() => parseI18nKeyContent('{"source":"x"}', CONVENTION)).toThrow(
      /answered without a key/
    )
    expect(() =>
      parseI18nKeyContent('[{"key":null}]', CONVENTION)
    ).toThrow(/answered without a key/)
  })

  it('rejects an answer that holds no JSON at all', () => {
    expect(() =>
      parseI18nKeyContent('I cannot help with that.', CONVENTION)
    ).toThrow(/did not answer with JSON/)
  })

  it('rejects an answer that is not valid JSON', () => {
    expect(() =>
      parseI18nKeyContent('[{"key":"demo_a",}]', CONVENTION)
    ).toThrow(/did not answer with JSON/)
  })
})

describe('toOpenAIAgentError', () => {
  it('passes an AgentError through untouched', () => {
    const original = new AgentError('quota', 'no credits')

    expect(toOpenAIAgentError(original, 'a-model')).toBe(original)
  })

  it('blames our own key on 401 and 403', () => {
    expect(
      toOpenAIAgentError(
        new AuthenticationError(401, undefined, 'bad key', headers),
        'a-model'
      ).kind
    ).toBe('config')
  })

  it('names the model when the endpoint does not serve it', () => {
    const error = new NotFoundError(404, undefined, 'model not found', headers)

    expect(toOpenAIAgentError(error, 'Qwen/Qwen3.8-7B').message).toContain(
      'Qwen/Qwen3.8-7B'
    )
  })

  it('treats a 429 as quota', () => {
    expect(
      toOpenAIAgentError(
        new RateLimitError(429, undefined, 'slow down', headers),
        'a-model'
      ).kind
    ).toBe('quota')
  })

  it('sniffs a quota refusal out of a 400 body', () => {
    // The platform reports a spent balance as a plain bad request.
    expect(
      toOpenAIAgentError(
        new BadRequestError(400, undefined, 'insufficient balance', headers),
        'a-model'
      ).kind
    ).toBe('quota')
  })

  it('treats any other 400 as an upstream failure', () => {
    expect(
      toOpenAIAgentError(
        new BadRequestError(400, undefined, 'unexpected field', headers),
        'a-model'
      ).kind
    ).toBe('upstream')
  })

  it('reports an unreachable endpoint as upstream', () => {
    expect(
      toOpenAIAgentError(
        new APIConnectionError({ message: 'fetch failed' }),
        'a-model'
      ).kind
    ).toBe('upstream')
  })

  it('falls back to upstream for a plain throw', () => {
    expect(toOpenAIAgentError(new Error('boom'), 'a-model').kind).toBe(
      'upstream'
    )
  })
})

describe('loadAgentPrompt', () => {
  it('reads the prompt file the agent actually uses', async () => {
    const prompt = await loadAgentPrompt('i18n-key', {
      NUXT_PROMPTS_DIR: REPO_PROMPTS,
    })

    expect(prompt.length).toBeGreaterThan(0)
  })

  it('still asks for the fields the parser requires', async () => {
    // The prompt is the only place the output contract is written down, and the
    // parser is what enforces it. Rewording the file can silently break the
    // pair, so this is the guard for that.
    const prompt = await loadAgentPrompt('i18n-key', {
      NUXT_PROMPTS_DIR: REPO_PROMPTS,
    })

    expect(prompt).toContain('"key"')
    expect(prompt).toContain('confidence')
    expect(prompt).toContain('alternatives')
    // Alternatives are objects now, and the parser reads them that way — the
    // prompt must not drift back to plain strings.
    expect(prompt).toContain('{"key"')
    // The word "JSON" is what makes the provider's JSON mode behave.
    expect(prompt).toContain('JSON')
  })

  it('names the missing file', async () => {
    await expect(
      loadAgentPrompt('i18n-key', { NUXT_PROMPTS_DIR: join(tmpdir(), 'nope') })
    ).rejects.toThrow(/i18n-key\.md" is missing/)
  })

  it('refuses a file with no prompt in it', async () => {
    const dir = await tempPromptsDir()
    try {
      await writeFile(join(dir, 'i18n-key.md'), '\n   \n')
      await expect(
        loadAgentPrompt('i18n-key', { NUXT_PROMPTS_DIR: dir })
      ).rejects.toThrow(/is empty/)
    } finally {
      await rm(dir, { recursive: true, force: true })
    }
  })

  it('re-reads a prompt that changed on disk', async () => {
    const dir = await tempPromptsDir()
    try {
      const file = join(dir, 'i18n-key.md')
      await writeFile(file, 'Name keys the first way.\n')
      expect(await loadAgentPrompt('i18n-key', { NUXT_PROMPTS_DIR: dir })).toBe(
        'Name keys the first way.'
      )

      await writeFile(file, 'Name keys the second way.\n')
      await touchLater(file)
      expect(await loadAgentPrompt('i18n-key', { NUXT_PROMPTS_DIR: dir })).toBe(
        'Name keys the second way.'
      )
    } finally {
      await rm(dir, { recursive: true, force: true })
    }
  })

  it('recovers once an empty prompt file is filled in', async () => {
    const dir = await tempPromptsDir()
    try {
      const file = join(dir, 'i18n-key.md')
      await writeFile(file, '   \n')
      await expect(
        loadAgentPrompt('i18n-key', { NUXT_PROMPTS_DIR: dir })
      ).rejects.toThrow(/is empty/)

      // The failure was not cached, so fixing the file is enough.
      await writeFile(file, 'You name keys.\n')
      expect(await loadAgentPrompt('i18n-key', { NUXT_PROMPTS_DIR: dir })).toBe(
        'You name keys.'
      )
    } finally {
      await rm(dir, { recursive: true, force: true })
    }
  })
})

describe('I18nKeyGenerateAgent', () => {
  afterEach(() => {
    vi.unstubAllEnvs()
  })

  it('fails with a config error rather than throwing on construction', async () => {
    vi.stubEnv('NUXT_OPENAI_API_KEY', '')
    // Building the agent must stay safe: a deployment with no AI key must not
    // fail to boot because of it.
    const agent = new I18nKeyGenerateAgent()

    await expect(agent.generateI18nKey(BASE)).rejects.toMatchObject({
      kind: 'config',
    })
  })
})

/**
 * The transport is exercised against a local stub rather than described: this
 * is what proves the provider-only fields really leave the process (the SDK
 * types do not declare them), and what covers the reasoning-chain branch.
 */
describe('I18nKeyGenerateAgent over HTTP', () => {
  let server: Server
  let baseURL: string
  let reply: Record<string, unknown>
  let sent: Record<string, any>[]
  let logged: string[]

  beforeEach(async () => {
    sent = []
    reply = {
      content: '[{"source":"Sign in","key":"demo_auth_btn"}]',
      reasoning_content: 'the text is a sign-in button, so …',
    }
    server = createServer((request, response) => {
      let raw = ''
      request.on('data', (chunk) => (raw += chunk))
      request.on('end', () => {
        sent.push(JSON.parse(raw))
        response.writeHead(200, { 'content-type': 'application/json' })
        response.end(
          JSON.stringify({
            id: 'stub',
            object: 'chat.completion',
            created: 0,
            model: 'stub',
            choices: [{ index: 0, finish_reason: 'stop', message: reply }],
          })
        )
      })
    })
    await new Promise<void>((done) => server.listen(0, '127.0.0.1', done))
    baseURL = `http://127.0.0.1:${(server.address() as AddressInfo).port}/v1`
    vi.stubEnv('NUXT_OPENAI_I18N_KEY_API_KEY', 'stub-key')
    vi.stubEnv('NUXT_OPENAI_I18N_KEY_BASE_URL', baseURL)
    // The agent logs a summary line per call; keep it out of the test output
    // but captured, so its presence is still asserted.
    logged = []
    vi.spyOn(console, 'log').mockImplementation((...args) => {
      logged.push(args.join(' '))
    })
  })

  afterEach(async () => {
    vi.restoreAllMocks()
    vi.unstubAllEnvs()
    await new Promise<void>((done) => server.close(() => done()))
  })

  it('parses a stub answer and logs one summary line', async () => {
    const result = await new I18nKeyGenerateAgent().generateI18nKey(BASE)

    expect(result.key).toBe('demo_auth_btn')
    expect(result.source).toBe('Sign in')
    expect(logged.some((line) => line.startsWith('[agent:i18n-key]'))).toBe(true)
  })

  it('sends the knobs the OpenAI schema does not declare', async () => {
    await new I18nKeyGenerateAgent().generateI18nKey(BASE)

    expect(sent).toHaveLength(1)
    // Presence, not values: the knobs are tuned constantly, and what this test
    // guards is that the SDK passes fields it does not declare straight through.
    for (const field of ['enable_thinking', 'thinking_budget', 'top_k']) {
      expect(sent[0]).toHaveProperty(field)
    }
    expect(sent[0].response_format).toEqual({ type: 'json_object' })
    expect(sent[0].max_tokens).toBeGreaterThan(0)
  })

  it('sends the user turn with the convention and no tag id', async () => {
    await new I18nKeyGenerateAgent().generateI18nKey(BASE)

    const userTurn = sent[0].messages[1].content as string
    expect(userTurn).toContain('Key convention:')
    expect(userTurn).toContain('prefix: demo')
    expect(userTurn).toContain('Sign in')
    expect(userTurn).not.toContain('tag_id')
  })

  it('says the reasoning arrived when the answer did not', async () => {
    // The documented way thinking goes wrong: the budget is spent on the chain
    // of thought and `content` never comes. Calling that an "empty answer"
    // hides the one fact worth knowing.
    reply = { content: '', reasoning_content: 'x'.repeat(300) }

    await expect(
      new I18nKeyGenerateAgent().generateI18nKey(BASE)
    ).rejects.toThrow(/300 chars of reasoning but no answer/)
  })
})
