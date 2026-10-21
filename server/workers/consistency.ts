import { parentPort, threadId, workerData } from 'node:worker_threads'
import { detectAll } from '../../shared/utils/consistency/rules'
import type {
  ConsistencyFinding,
  RuleProgress,
  ScanContext,
} from '../../shared/utils/consistency/types'

/**
 * The rule registry off the main thread. Not part of the Nitro bundle: it is
 * started from source through `tsx` (a production dependency), so it may only
 * import by relative path — `shared/` and this folder ship in the image.
 *
 * It never logs itself: a worker's console is flushed asynchronously and can
 * be cut off by `terminate()`. It reports through messages and the main
 * thread writes the log, with the project id.
 */

export type ScanWorkerMessage =
  | { type: 'ready'; threadId: number }
  | ({ type: 'progress' } & RuleProgress)
  | { type: 'done'; findings: ConsistencyFinding[]; ms: number }

const port = parentPort
if (port) {
  const post = (message: ScanWorkerMessage) => port.postMessage(message)
  post({ type: 'ready', threadId })
  const startedAt = performance.now()
  const findings = detectAll(workerData as ScanContext, {
    onRule: (progress) => post({ type: 'progress', ...progress }),
  })
  post({ type: 'done', findings, ms: performance.now() - startedAt })
}
