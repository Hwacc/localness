import { randomUUID } from 'node:crypto'
import type {
  TranslationItem,
  TranslationParams,
  TranslationResult,
} from '#server/libs/agent/TranslationAgent'
import type { GateIssue, GateResult } from '#shared/utils/consistency'
import type { AiCellReason } from '#server/helper/ai-translate'

export type AiItemStatus = 'pending' | 'pass' | 'fixed' | 'fail' | 'error'

export interface AiPlanItem {
  keyId: number
  key: string
  locale: string
  reason: AiCellReason
  source: string
  /** The same sentence in other locales: terminology for the model only. */
  other?: Record<string, string>
}

export interface AiJobItem extends AiPlanItem {
  /** `keyId:locale` — what apply and retry name a row by. */
  id: string
  status: AiItemStatus
  text: string | null
  /** The model's own text, when the gate repaired it. */
  original?: string
  issues?: GateIssue[]
  error?: string
  applied: boolean
}

export interface AiJobCounts {
  total: number
  done: number
  pass: number
  fixed: number
  fail: number
  error: number
}

export interface AiJobEvent {
  id: number
  event: 'item' | 'progress' | 'done' | 'error'
  data: unknown
}

export type AiJobState = 'running' | 'done' | 'cancelled'

export type AiGate = (item: AiJobItem, text: string) => GateResult

export interface AiJob {
  id: string
  projectId: number
  userId: number | null
  model: string
  sourceLocale: string
  /** The project's own rules, bound at start: what a result must keep intact. */
  gate: AiGate
  state: AiJobState
  createdAt: number
  finishedAt: number | null
  items: AiJobItem[]
  events: AiJobEvent[]
}

export class AiJobBusyError extends Error {
  constructor(readonly jobId: string) {
    super('A translation batch is already running for this project')
  }
}

export interface AiJobDeps {
  translate: (params: TranslationParams) => Promise<TranslationResult[]>
  /** Items per model request. */
  blockSize?: number
  /** Model requests in flight across the whole instance. */
  concurrency?: number
  /** How long a finished job stays reachable. */
  ttlMs?: number
  now?: () => number
}

const DEFAULT_BLOCK_SIZE = 20
const DEFAULT_CONCURRENCY = 2
const DEFAULT_TTL_MS = 30 * 60 * 1000

export function aiItemId(keyId: number, locale: string) {
  return `${keyId}:${locale}`
}

export function countAiItems(items: AiJobItem[]): AiJobCounts {
  const counts = { total: items.length, done: 0, pass: 0, fixed: 0, fail: 0, error: 0 }
  for (const item of items) {
    if (item.status === 'pending') continue
    counts.done++
    counts[item.status]++
  }
  return counts
}

function toAgentItem(item: AiJobItem): TranslationItem {
  return {
    id: item.id,
    source: item.source,
    key: item.key,
    other: item.other,
  }
}

function chunk<T>(list: T[], size: number): T[][] {
  const out: T[][] = []
  for (let i = 0; i < list.length; i += size) out.push(list.slice(i, i + size))
  return out
}

function createLimiter(max: number) {
  let active = 0
  const waiting: Array<() => void> = []
  return async function run<T>(task: () => Promise<T>): Promise<T> {
    if (active >= max) await new Promise<void>((resolve) => waiting.push(resolve))
    active++
    try {
      return await task()
    } finally {
      active--
      waiting.shift()?.()
    }
  }
}

/**
 * Batch translation jobs, held in process memory: a restart loses them, and a
 * finished one is dropped after `ttlMs`. A project runs one at a time; the
 * model requests of every job share one instance-wide limit.
 */
export function createAiTranslateJobs(deps: AiJobDeps) {
  const blockSize = deps.blockSize ?? DEFAULT_BLOCK_SIZE
  const ttlMs = deps.ttlMs ?? DEFAULT_TTL_MS
  const now = deps.now ?? Date.now
  const limit = createLimiter(deps.concurrency ?? DEFAULT_CONCURRENCY)
  const jobs = new Map<string, AiJob>()
  const listeners = new Map<string, Set<(event: AiJobEvent) => void>>()
  const settled = new Map<string, Promise<void>>()

  function sweep() {
    for (const job of jobs.values()) {
      if (job.finishedAt != null && now() - job.finishedAt > ttlMs) {
        jobs.delete(job.id)
        listeners.delete(job.id)
        settled.delete(job.id)
      }
    }
  }

  function emit(job: AiJob, event: AiJobEvent['event'], data: unknown) {
    const entry = { id: job.events.length, event, data }
    job.events.push(entry)
    for (const listener of listeners.get(job.id) ?? []) listener(entry)
  }

  function emitProgress(job: AiJob) {
    emit(job, 'progress', countAiItems(job.items))
  }

  async function runBlock(job: AiJob, locale: string, items: AiJobItem[]) {
    await limit(async () => {
      if (job.state === 'cancelled') return
      let results: TranslationResult[] | null = null
      let failure = ''
      try {
        results = await deps.translate({
          sourceLocale: job.sourceLocale,
          targetLocale: locale,
          items: items.map(toAgentItem),
        })
      } catch (error) {
        failure = error instanceof Error ? error.message : String(error)
      }
      for (const item of items) {
        const result = results?.find((one) => one.id === item.id)
        if (!result || result.text === null) {
          item.status = 'error'
          item.error =
            failure || 'The model returned no translation for this item'
        } else {
          const gated = job.gate(item, result.text)
          item.status = gated.status
          item.text = gated.text
          if (gated.status === 'fixed') item.original = gated.original
          if (gated.status === 'fail') item.issues = gated.issues
          item.error = undefined
        }
        emit(job, 'item', item)
      }
      emitProgress(job)
    })
  }

  function run(job: AiJob, items: AiJobItem[]) {
    const byLocale = new Map<string, AiJobItem[]>()
    for (const item of items) {
      byLocale.set(item.locale, [...(byLocale.get(item.locale) ?? []), item])
    }
    const blocks = [...byLocale].flatMap(([locale, list]) =>
      chunk(list, blockSize).map((block) => runBlock(job, locale, block))
    )
    const promise = Promise.all(blocks)
      .then(() => undefined)
      .catch((error: unknown) => {
        console.error(`[ai-translate] job ${job.id} failed`, error)
        emit(job, 'error', {
          message: error instanceof Error ? error.message : String(error),
        })
      })
      .finally(() => {
        if (job.state === 'cancelled') return
        job.state = 'done'
        job.finishedAt = now()
        emit(job, 'done', { state: job.state, ...countAiItems(job.items) })
      })
    settled.set(job.id, promise)
  }

  function active(projectId: number) {
    sweep()
    return [...jobs.values()].find(
      (job) => job.projectId === projectId && job.state === 'running'
    )
  }

  return {
    start(params: {
      projectId: number
      userId: number | null
      model: string
      sourceLocale: string
      gate: AiGate
      plan: AiPlanItem[]
    }): AiJob {
      const busy = active(params.projectId)
      if (busy) throw new AiJobBusyError(busy.id)
      const job: AiJob = {
        id: randomUUID(),
        projectId: params.projectId,
        userId: params.userId,
        model: params.model,
        sourceLocale: params.sourceLocale,
        gate: params.gate,
        state: 'running',
        createdAt: now(),
        finishedAt: null,
        items: params.plan.map((cell) => ({
          ...cell,
          id: aiItemId(cell.keyId, cell.locale),
          status: 'pending',
          text: null,
          applied: false,
        })),
        events: [],
      }
      jobs.set(job.id, job)
      emitProgress(job)
      run(job, job.items)
      return job
    },

    get(projectId: number, jobId: string): AiJob | undefined {
      sweep()
      const job = jobs.get(jobId)
      return job?.projectId === projectId ? job : undefined
    },

    active,

    /** Items already answered stay; the ones not yet sent are never sent. */
    cancel(job: AiJob) {
      if (job.state !== 'running') return
      job.state = 'cancelled'
      job.finishedAt = now()
      emit(job, 'done', { state: job.state, ...countAiItems(job.items) })
    },

    /** Re-asks the items that failed. A running job has nothing to retry yet. */
    retry(job: AiJob): number {
      if (job.state === 'running') return 0
      const failed = job.items.filter((item) => item.status === 'error')
      if (!failed.length) return 0
      const busy = active(job.projectId)
      if (busy) throw new AiJobBusyError(busy.id)
      for (const item of failed) {
        item.status = 'pending'
        item.error = undefined
      }
      job.state = 'running'
      job.finishedAt = null
      emitProgress(job)
      run(job, failed)
      return failed.length
    },

    /** Events from `from` on, then every later one until `unsubscribe`. */
    subscribe(job: AiJob, from: number, onEvent: (event: AiJobEvent) => void) {
      for (const event of job.events.slice(from)) onEvent(event)
      const set = listeners.get(job.id) ?? new Set()
      set.add(onEvent)
      listeners.set(job.id, set)
      return () => {
        set.delete(onEvent)
      }
    },

    /** Resolves once every request of the job's current run has settled. */
    settled(job: AiJob): Promise<void> {
      return settled.get(job.id) ?? Promise.resolve()
    },
  }
}
