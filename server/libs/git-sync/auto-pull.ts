import {
  GIT_AUTO_PULL_DEFAULT_MINUTES,
  GIT_AUTO_PULL_MAX_BACKOFF_MS,
} from '#shared/constants'

export interface AutoPullBinding {
  projectId: number
  remoteUrl: string
  branch: string
  credentialKind: string
  token: string
  lastRemoteSha: string
  leaseUntil: Date | null
}

export interface AutoPullDeps {
  listBindings: () => Promise<AutoPullBinding[]>
  remoteHead: (binding: AutoPullBinding) => Promise<string>
  /** A person's unexpired pending pull preview: the poller must not replace it. */
  hasHumanPreview: (projectId: number) => Promise<boolean>
  /** Runs a pull preview and cancels it, leaving conflict cards behind. */
  probe: (
    projectId: number
  ) => Promise<{ applyTheirs: number; conflicts: number }>
  saveHead: (projectId: number, sha: string) => Promise<void>
  notify: (params: {
    projectId: number
    applyTheirs: number
    conflicts: number
  }) => Promise<void>
  now?: () => number
  log?: Pick<Console, 'warn' | 'error'>
}

/** Minutes from the env value: unset means the default, 0 turns polling off. */
export function parseAutoPullMinutes(raw: string | undefined): number | null {
  const text = raw?.trim()
  if (!text) return GIT_AUTO_PULL_DEFAULT_MINUTES
  const minutes = Number(text)
  if (!Number.isFinite(minutes) || minutes < 0) return null
  return minutes
}

function groupKey(binding: AutoPullBinding) {
  const url = binding.remoteUrl.trim().toLowerCase().replace(/\.git$/, '')
  return [url, binding.branch, binding.credentialKind, binding.token].join('\0')
}

/**
 * One poll per remote, however many projects share it. A head that moved only
 * ever costs a preview: nothing is applied, and the preview itself is dropped
 * so the person's own Pull preview is the one that gets confirmed.
 */
export function createAutoPull(deps: AutoPullDeps, intervalMs: number) {
  const now = deps.now ?? Date.now
  const log = deps.log ?? console
  const backoff = new Map<string, { fails: number; until: number }>()
  let running = false

  function fail(key: string) {
    const fails = (backoff.get(key)?.fails ?? 0) + 1
    const cap = Math.max(intervalMs, GIT_AUTO_PULL_MAX_BACKOFF_MS)
    const delay = Math.min(intervalMs * 2 ** fails, cap)
    backoff.set(key, { fails, until: now() + delay })
  }

  async function checkProject(binding: AutoPullBinding, head: string) {
    const { projectId } = binding
    if (!binding.lastRemoteSha) {
      await deps.saveHead(projectId, head)
      return
    }
    if (binding.lastRemoteSha === head) return
    if (binding.leaseUntil && binding.leaseUntil.getTime() > now()) return
    if (await deps.hasHumanPreview(projectId)) return
    try {
      const found = await deps.probe(projectId)
      if (found.applyTheirs || found.conflicts) {
        await deps.notify({ projectId, ...found })
      }
      await deps.saveHead(projectId, head)
    } catch (error) {
      // Unsaved head: the next round tries this project again.
      log.warn(`[git-auto-pull] project ${projectId} preview failed`, error)
    }
  }

  async function runRound() {
    if (running) return
    running = true
    try {
      const groups = new Map<string, AutoPullBinding[]>()
      for (const binding of await deps.listBindings()) {
        const key = groupKey(binding)
        groups.set(key, [...(groups.get(key) ?? []), binding])
      }
      for (const [key, bindings] of groups) {
        if ((backoff.get(key)?.until ?? 0) > now()) continue
        let head: string
        try {
          head = await deps.remoteHead(bindings[0]!)
        } catch (error) {
          fail(key)
          log.warn(
            `[git-auto-pull] ls-remote failed for ${bindings[0]!.remoteUrl}`,
            error instanceof Error ? error.message : error
          )
          continue
        }
        backoff.delete(key)
        for (const binding of bindings) {
          await checkProject(binding, head).catch((error: unknown) =>
            log.error(
              `[git-auto-pull] project ${binding.projectId} check failed`,
              error
            )
          )
        }
      }
    } finally {
      running = false
    }
  }

  return { runRound }
}
