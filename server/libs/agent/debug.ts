import type { Env } from './AbstractAgent'

/**
 * Whether to log payloads on top of the summary line.
 *
 * Off unless asked for: the prompts carry the project's own UI text and the
 * answers carry the model's, and neither belongs in a production log by
 * default. The summary line stays on either way — model, knobs, latency and
 * outcome are metadata, and latency is what a reasoning budget is traded against.
 */
export function isAiDebug(env: Env = process.env): boolean {
  const flag = env.NUXT_AI_DEBUG?.trim().toLowerCase()
  return flag === '1' || flag === 'true' || flag === 'yes'
}

/** Prints a payload in full, or nothing at all when {@link isAiDebug} is off. */
export function logAiPayload(
  label: string,
  payload: unknown,
  env: Env = process.env
): void {
  if (!isAiDebug(env)) return
  const text =
    typeof payload === 'string' ? payload : JSON.stringify(payload, null, 2)
  console.log(`[ai] ${label}\n${text}`)
}
