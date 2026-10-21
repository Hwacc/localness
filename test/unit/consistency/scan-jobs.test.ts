import { describe, expect, it, vi } from 'vitest'
import { createScanJobs, type ScanProgress } from '#server/helper/scan-jobs'
import {
  formatMs,
  isConsistencyDebug,
  scanLogger,
} from '#server/helper/consistency-log'
import {
  allRules,
  detectAll,
  DEFAULT_SCAN_SETTINGS,
  type RuleProgress,
} from '#shared/utils/consistency'

function deferred() {
  let resolve!: () => void
  let reject!: (error: unknown) => void
  const promise = new Promise<void>((res, rej) => {
    resolve = res
    reject = rej
  })
  return { promise, resolve, reject }
}

const NOW = new Date('2026-10-21T08:00:00.000Z')

describe('createScanJobs', () => {
  it('is idle before any scan', () => {
    const jobs = createScanJobs(async () => {})
    expect(jobs.status(1)).toEqual({ state: 'idle' })
  })

  it('reports a running scan and its progress, then returns to idle', async () => {
    const gate = deferred()
    let report: ((update: ScanProgress) => void) | undefined
    const jobs = createScanJobs(async (_projectId, progress) => {
      report = progress
      await gate.promise
    }, () => NOW)

    expect(jobs.start(1)).toEqual({
      state: 'running',
      phase: 'loading',
      done: 0,
      total: 0,
      startedAt: NOW.toISOString(),
    })
    await Promise.resolve()
    report?.({ phase: 'checking', done: 3, total: 11 })
    expect(jobs.status(1)).toMatchObject({ state: 'running', phase: 'checking', done: 3, total: 11 })

    gate.resolve()
    await jobs.settled(1)
    expect(jobs.status(1)).toEqual({ state: 'idle' })
  })

  it('joins a running scan instead of starting a second one', async () => {
    const gate = deferred()
    let runs = 0
    const jobs = createScanJobs(async () => {
      runs += 1
      await gate.promise
    })
    jobs.start(1)
    jobs.start(1)
    gate.resolve()
    await jobs.settled(1)
    expect(runs).toBe(1)
  })

  it('keeps projects independent', async () => {
    const started: number[] = []
    const jobs = createScanJobs(async (projectId) => {
      started.push(projectId)
    })
    jobs.start(1)
    jobs.start(2)
    await Promise.all([jobs.settled(1), jobs.settled(2)])
    expect(started.sort()).toEqual([1, 2])
  })

  it('keeps the last error until the next start', async () => {
    let fail = true
    const jobs = createScanJobs(async () => {
      if (fail) throw new Error('disk full')
    }, () => NOW)
    const originalError = console.error
    console.error = () => {}
    try {
      jobs.start(1)
      await jobs.settled(1)
    } finally {
      console.error = originalError
    }
    expect(jobs.status(1)).toEqual({
      state: 'failed',
      error: 'disk full',
      finishedAt: NOW.toISOString(),
    })

    fail = false
    jobs.start(1)
    expect(jobs.status(1)).toMatchObject({ state: 'running' })
    await jobs.settled(1)
    expect(jobs.status(1)).toEqual({ state: 'idle' })
  })
})

describe('detectAll progress', () => {
  it('reports once per rule, including rules switched off', () => {
    const calls: RuleProgress[] = []
    detectAll(
      {
        ...DEFAULT_SCAN_SETTINGS,
        ruleSeverity: { numbers: 'off' },
        projectId: 1,
        sourceLocale: 'en',
        keys: [],
      },
      { onRule: (progress) => calls.push(progress) }
    )
    expect(calls.map((call) => call.ruleId)).toEqual(
      allRules.map((rule) => rule.id)
    )
    expect(calls.at(-1)).toMatchObject({
      done: allRules.length,
      total: allRules.length,
    })
    expect(calls.find((call) => call.ruleId === 'numbers')).toMatchObject({
      off: true,
      findings: 0,
    })
    for (const call of calls) expect(call.ms).toBeGreaterThanOrEqual(0)
  })
})

describe('scan log', () => {
  it('writes rule timings only with NUXT_CONSISTENCY_DEBUG', () => {
    expect(isConsistencyDebug({})).toBe(false)
    expect(isConsistencyDebug({ NUXT_CONSISTENCY_DEBUG: '0' })).toBe(false)
    for (const value of ['1', 'true', ' YES ']) {
      expect(isConsistencyDebug({ NUXT_CONSISTENCY_DEBUG: value })).toBe(true)
    }
    const spy = vi.spyOn(console, 'log').mockImplementation(() => {})
    try {
      scanLogger(7, {}).debug('hidden')
      expect(spy).not.toHaveBeenCalled()
      scanLogger(7, { NUXT_CONSISTENCY_DEBUG: '1' }).debug('shown')
      scanLogger(7, {}).info('always')
      expect(spy.mock.calls).toEqual([
        ['[consistency] project 7:', 'shown'],
        ['[consistency] project 7:', 'always'],
      ])
    } finally {
      spy.mockRestore()
    }
  })

  it('formats durations', () => {
    expect(formatMs(12.4)).toBe('12ms')
    expect(formatMs(1534)).toBe('1.53s')
  })
})
