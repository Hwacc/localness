/**
 * Consistency scan log. One summary line per stage is always written —
 * key count, worker boot, rule pass, save, recheck — so an operator can see
 * the worker is used and how long a scan takes. Per-rule timings (and the
 * worker's exit) only with `NUXT_CONSISTENCY_DEBUG`: eleven lines per scan,
 * and a scan follows every edit.
 */

type Env = Record<string, string | undefined>

export function isConsistencyDebug(env: Env = process.env): boolean {
  const flag = env.NUXT_CONSISTENCY_DEBUG?.trim().toLowerCase()
  return flag === '1' || flag === 'true' || flag === 'yes'
}

export function scanLogger(projectId: number, env: Env = process.env) {
  const prefix = `[consistency] project ${projectId}:`
  const debug = isConsistencyDebug(env)
  return {
    info: (message: string) => console.log(prefix, message),
    warn: (message: string, error?: unknown) =>
      error === undefined
        ? console.warn(prefix, message)
        : console.warn(prefix, message, error),
    debug: (message: string) => {
      if (debug) console.log(prefix, message)
    },
  }
}

export type ScanLogger = ReturnType<typeof scanLogger>

export function formatMs(ms: number): string {
  return ms < 1000 ? `${Math.round(ms)}ms` : `${(ms / 1000).toFixed(2)}s`
}
