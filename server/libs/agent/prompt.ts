import type { Stats } from 'node:fs'
import { readFile, stat } from 'node:fs/promises'
import { resolve } from 'node:path'
import type { AgentFeature, Env } from './AbstractAgent'
import { AgentError } from './AbstractAgent'

/**
 * Prompts ship next to the code (`server/prompts`, copied into the image at
 * `/app/prompts`) but are meant to be overridable, so the directory is a
 * deployment knob rather than a hardcoded path.
 */
export function promptsDir(env: Env = process.env): string {
  return env.NUXT_PROMPTS_DIR?.trim() || resolve(process.cwd(), 'server/prompts')
}

type CacheEntry = {
  mtimeMs: number
  size: number
  prompt: string
}

const cache = new Map<string, CacheEntry>()

/**
 * Reads one prompt file and returns its text verbatim: the file *is* the system
 * prompt, so nothing in it is a comment and nothing is stripped beyond
 * surrounding whitespace.
 *
 * Re-read whenever the file changes on disk, so an edited prompt takes effect
 * without a restart. A failure is never cached — a typo would otherwise keep
 * failing after the file was fixed, and being fixable is why this is a file.
 */
export async function loadAgentPrompt(
  feature: AgentFeature,
  env: Env = process.env
): Promise<string> {
  const file = resolve(promptsDir(env), `${feature}.md`)
  let stats: Stats
  try {
    stats = await stat(file)
  } catch (error) {
    throw new AgentError('config', `Prompt file "${file}" is missing`, {
      cause: error,
    })
  }
  const cached = cache.get(file)
  if (cached?.mtimeMs === stats.mtimeMs && cached.size === stats.size) {
    return cached.prompt
  }

  let raw: string
  try {
    raw = await readFile(file, 'utf8')
  } catch (error) {
    throw new AgentError('config', `Prompt file "${file}" is unreadable`, {
      cause: error,
    })
  }
  const prompt = raw.trim()
  if (!prompt) {
    throw new AgentError('config', `Prompt file "${file}" is empty`)
  }
  cache.set(file, { mtimeMs: stats.mtimeMs, size: stats.size, prompt })
  return prompt
}
