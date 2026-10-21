import type { ScanPhase, ScanStatus } from '#shared/utils/consistency'

export interface ScanProgress {
  phase: ScanPhase
  done?: number
  total?: number
}

export type ScanRun = (
  projectId: number,
  progress: (update: ScanProgress) => void
) => Promise<void>

type RunningStatus = Extract<ScanStatus, { state: 'running' }>
type FailedStatus = Extract<ScanStatus, { state: 'failed' }>

/**
 * At most one background scan per project. Starting while one runs joins it
 * rather than queueing: when it finishes, a report that is still outdated
 * simply starts the next one. State is in-process memory — the app is a
 * single Node process, and a restart mid-scan keeps the previous snapshot.
 */
export function createScanJobs(run: ScanRun, now: () => Date = () => new Date()) {
  const running = new Map<number, { status: RunningStatus; settled: Promise<void> }>()
  const failed = new Map<number, FailedStatus>()

  function status(projectId: number): ScanStatus {
    return running.get(projectId)?.status ?? failed.get(projectId) ?? { state: 'idle' }
  }

  function start(projectId: number): ScanStatus {
    const current = running.get(projectId)
    if (current) return current.status
    failed.delete(projectId)

    const job: { status: RunningStatus; settled: Promise<void> } = {
      status: {
        state: 'running',
        phase: 'loading',
        done: 0,
        total: 0,
        startedAt: now().toISOString(),
      },
      settled: Promise.resolve(),
    }
    running.set(projectId, job)
    job.settled = Promise.resolve()
      .then(() =>
        run(projectId, (update) => {
          job.status = {
            ...job.status,
            phase: update.phase,
            done: update.done ?? 0,
            total: update.total ?? 0,
          }
        })
      )
      .catch((error: unknown) => {
        console.error(`[consistency] scan of project ${projectId} failed`, error)
        failed.set(projectId, {
          state: 'failed',
          error: error instanceof Error ? error.message : String(error),
          finishedAt: now().toISOString(),
        })
      })
      .finally(() => running.delete(projectId))
    return job.status
  }

  /** Resolves once the project's current scan (if any) has finished. */
  function settled(projectId: number): Promise<void> {
    return running.get(projectId)?.settled ?? Promise.resolve()
  }

  return { start, status, settled }
}
