import { describe, expect, it } from 'vitest'
import {
  AiJobBusyError,
  countAiItems,
  createAiTranslateJobs,
} from '#server/helper/ai-translate-jobs'
import type { AiGate, AiPlanItem } from '#server/helper/ai-translate-jobs'
import type { TranslationParams } from '#server/libs/agent/TranslationAgent'

const cell = (keyId: number, locale = 'fr'): AiPlanItem => ({
  keyId,
  key: `k${keyId}`,
  locale,
  reason: 'empty',
  source: `Text ${keyId}`,
})

const passGate: AiGate = (_item, text) => ({ status: 'pass', text })

const start = (
  jobs: ReturnType<typeof createAiTranslateJobs>,
  plan: AiPlanItem[],
  overrides: { projectId?: number; gate?: AiGate } = {}
) =>
  jobs.start({
    projectId: overrides.projectId ?? 1,
    userId: 9,
    model: 'm',
    sourceLocale: 'en',
    gate: overrides.gate ?? passGate,
    plan,
  })

const echo = async (params: TranslationParams) =>
  params.items.map((item) => ({ id: item.id, text: `${params.targetLocale}:${item.source}` }))

function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((r) => (resolve = r))
  return { promise, resolve }
}

describe('ai translate jobs', () => {
  it('translates in blocks per language and reports each row once', async () => {
    const calls: TranslationParams[] = []
    const jobs = createAiTranslateJobs({
      blockSize: 2,
      translate: async (params) => {
        calls.push(params)
        return echo(params)
      },
    })
    const job = start(jobs, [cell(1), cell(2), cell(3), cell(1, 'de')])
    await jobs.settled(job)

    expect(job.state).toBe('done')
    expect(calls.map((c) => [c.targetLocale, c.items.length]).sort()).toEqual([
      ['de', 1],
      ['fr', 1],
      ['fr', 2],
    ])
    expect(countAiItems(job.items)).toMatchObject({ total: 4, done: 4, pass: 4 })
    expect(job.events.filter((e) => e.event === 'item')).toHaveLength(4)
    expect(job.events.at(-1)?.event).toBe('done')
  })

  it('records the gate verdict and keeps the model text when it fails', async () => {
    const jobs = createAiTranslateJobs({ translate: echo })
    const gate: AiGate = (item, text) =>
      item.keyId === 1
        ? { status: 'fail', text, issues: [] }
        : item.keyId === 2
          ? { status: 'fixed', text: 'repaired', original: text }
          : { status: 'pass', text }
    const job = start(jobs, [cell(1), cell(2), cell(3)], { gate })
    await jobs.settled(job)

    const byKey = Object.fromEntries(job.items.map((i) => [i.keyId, i]))
    expect(byKey[1]).toMatchObject({ status: 'fail', text: 'fr:Text 1' })
    expect(byKey[2]).toMatchObject({ status: 'fixed', text: 'repaired', original: 'fr:Text 2' })
    expect(byKey[3]?.status).toBe('pass')
  })

  it('fails one block without failing the others, and retry re-asks only it', async () => {
    let broken = true
    const jobs = createAiTranslateJobs({
      blockSize: 1,
      translate: async (params) => {
        if (broken && params.items[0]!.id === '1:fr') throw new Error('boom')
        return echo(params)
      },
    })
    const job = start(jobs, [cell(1), cell(2)])
    await jobs.settled(job)
    expect(job.items.map((i) => i.status)).toEqual(['error', 'pass'])
    expect(job.items[0]!.error).toBe('boom')

    broken = false
    expect(jobs.retry(job)).toBe(1)
    await jobs.settled(job)
    expect(job.items.map((i) => i.status)).toEqual(['pass', 'pass'])
  })

  it('marks an item the model left out as an error', async () => {
    const jobs = createAiTranslateJobs({
      translate: async (params) => [{ id: params.items[0]!.id, text: null }],
    })
    const job = start(jobs, [cell(1)])
    await jobs.settled(job)
    expect(job.items[0]).toMatchObject({ status: 'error' })
  })

  it('runs one batch per project but lets other projects run', async () => {
    const gate = deferred<void>()
    const jobs = createAiTranslateJobs({
      translate: async (params) => {
        await gate.promise
        return echo(params)
      },
    })
    const first = start(jobs, [cell(1)])
    expect(() => start(jobs, [cell(2)])).toThrow(AiJobBusyError)
    expect(jobs.active(1)?.id).toBe(first.id)
    const other = start(jobs, [cell(3)], { projectId: 2 })
    gate.resolve()
    await Promise.all([jobs.settled(first), jobs.settled(other)])
    expect(jobs.active(1)).toBeUndefined()
    expect(() => start(jobs, [cell(4)])).not.toThrow()
  })

  it('limits model requests across jobs', async () => {
    let running = 0
    let peak = 0
    const jobs = createAiTranslateJobs({
      blockSize: 1,
      concurrency: 2,
      translate: async (params) => {
        running++
        peak = Math.max(peak, running)
        await new Promise((resolve) => setTimeout(resolve, 5))
        running--
        return echo(params)
      },
    })
    const job = start(jobs, [cell(1), cell(2), cell(3), cell(4), cell(5)])
    await jobs.settled(job)
    expect(peak).toBe(2)
  })

  it('stops sending requests after cancel and keeps what was answered', async () => {
    const gate = deferred<void>()
    let calls = 0
    const jobs = createAiTranslateJobs({
      blockSize: 1,
      concurrency: 1,
      translate: async (params) => {
        calls++
        await gate.promise
        return echo(params)
      },
    })
    const job = start(jobs, [cell(1), cell(2), cell(3)])
    jobs.cancel(job)
    expect(job.state).toBe('cancelled')
    gate.resolve()
    await jobs.settled(job)
    expect(calls).toBe(1)
    expect(job.items.filter((i) => i.status === 'pending')).toHaveLength(2)
    expect(job.events.filter((e) => e.event === 'done')).toHaveLength(1)
  })

  it('replays history from an event id, then streams live', async () => {
    const jobs = createAiTranslateJobs({ translate: echo })
    const job = start(jobs, [cell(1)])
    await jobs.settled(job)
    const seen: number[] = []
    jobs.subscribe(job, 1, (e) => seen.push(e.id))
    expect(seen).toEqual(job.events.slice(1).map((e) => e.id))
  })

  it('hides a job from another project and drops it after the retention', async () => {
    let clock = 0
    const jobs = createAiTranslateJobs({ translate: echo, ttlMs: 1000, now: () => clock })
    const job = start(jobs, [cell(1)])
    await jobs.settled(job)
    expect(jobs.get(2, job.id)).toBeUndefined()
    expect(jobs.get(1, job.id)).toBe(job)
    clock = 1001
    expect(jobs.get(1, job.id)).toBeUndefined()
  })
})
