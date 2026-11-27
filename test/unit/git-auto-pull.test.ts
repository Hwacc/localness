import { describe, expect, it, vi } from 'vitest'
import {
  createAutoPull,
  parseAutoPullMinutes,
  type AutoPullBinding,
  type AutoPullDeps,
} from '#server/libs/git-sync/auto-pull'

const MIN = 60_000

function binding(over: Partial<AutoPullBinding> = {}): AutoPullBinding {
  return {
    projectId: 1,
    remoteUrl: 'https://bitbucket.org/acme/i18n.git',
    branch: 'main',
    credentialKind: 'repo',
    token: 't',
    lastRemoteSha: 'old',
    leaseUntil: null,
    ...over,
  }
}

function setup(
  bindings: AutoPullBinding[],
  over: Partial<AutoPullDeps> = {},
  intervalMs = 120 * MIN
) {
  let clock = 1_000_000
  const deps = {
    listBindings: vi.fn(async () => bindings),
    remoteHead: vi.fn(async () => 'new'),
    hasHumanPreview: vi.fn(async () => false),
    probe: vi.fn(async () => ({ applyTheirs: 2, conflicts: 1 })),
    saveHead: vi.fn(async () => {}),
    notify: vi.fn(async () => {}),
    now: () => clock,
    log: { warn: vi.fn(), error: vi.fn() },
    ...over,
  }
  return {
    deps,
    poller: createAutoPull(deps, intervalMs),
    advance: (ms: number) => {
      clock += ms
    },
  }
}

describe('parseAutoPullMinutes', () => {
  it('defaults to 120, honours 0 and rejects junk', () => {
    expect(parseAutoPullMinutes(undefined)).toBe(120)
    expect(parseAutoPullMinutes('')).toBe(120)
    expect(parseAutoPullMinutes('0')).toBe(0)
    expect(parseAutoPullMinutes('15')).toBe(15)
    expect(parseAutoPullMinutes('abc')).toBeNull()
    expect(parseAutoPullMinutes('-1')).toBeNull()
  })
})

describe('createAutoPull', () => {
  it('previews, notifies and records the head when it moved', async () => {
    const { deps, poller } = setup([binding()])
    await poller.runRound()
    expect(deps.probe).toHaveBeenCalledWith(1)
    expect(deps.notify).toHaveBeenCalledWith({
      projectId: 1,
      applyTheirs: 2,
      conflicts: 1,
    })
    expect(deps.saveHead).toHaveBeenCalledWith(1, 'new')
  })

  it('does nothing when the head is unchanged', async () => {
    const { deps, poller } = setup([binding({ lastRemoteSha: 'new' })])
    await poller.runRound()
    expect(deps.probe).not.toHaveBeenCalled()
    expect(deps.saveHead).not.toHaveBeenCalled()
  })

  it('baselines without previewing when no head was recorded', async () => {
    const { deps, poller } = setup([binding({ lastRemoteSha: '' })])
    await poller.runRound()
    expect(deps.saveHead).toHaveBeenCalledWith(1, 'new')
    expect(deps.probe).not.toHaveBeenCalled()
  })

  it('asks the remote once for projects sharing it', async () => {
    const { deps, poller } = setup([
      binding({ projectId: 1 }),
      binding({ projectId: 2, remoteUrl: 'https://Bitbucket.org/acme/i18n' }),
    ])
    await poller.runRound()
    expect(deps.remoteHead).toHaveBeenCalledTimes(1)
    expect(deps.probe).toHaveBeenCalledTimes(2)
  })

  it('skips a project that is syncing or has a person’s preview open', async () => {
    const busy = binding({
      projectId: 1,
      leaseUntil: new Date(1_000_000 + MIN),
    })
    const reviewing = binding({ projectId: 2 })
    const { deps, poller } = setup([busy, reviewing], {
      hasHumanPreview: vi.fn(async (id: number) => id === 2),
    })
    await poller.runRound()
    expect(deps.probe).not.toHaveBeenCalled()
    expect(deps.saveHead).not.toHaveBeenCalled()
  })

  it('stays quiet when the preview finds nothing to pull', async () => {
    const { deps, poller } = setup([binding()], {
      probe: vi.fn(async () => ({ applyTheirs: 0, conflicts: 0 })),
    })
    await poller.runRound()
    expect(deps.notify).not.toHaveBeenCalled()
    expect(deps.saveHead).toHaveBeenCalledWith(1, 'new')
  })

  it('keeps the old head when the preview fails, so the next round retries', async () => {
    const { deps, poller } = setup([binding()], {
      probe: vi.fn(async () => {
        throw new Error('clone failed')
      }),
    })
    await poller.runRound()
    expect(deps.saveHead).not.toHaveBeenCalled()
    expect(deps.notify).not.toHaveBeenCalled()
  })

  it('backs off a remote that fails and retries after the delay', async () => {
    const { deps, poller, advance } = setup(
      [binding()],
      {
        remoteHead: vi
          .fn<AutoPullDeps['remoteHead']>()
          .mockRejectedValueOnce(new Error('down'))
          .mockResolvedValue('new'),
      },
      MIN
    )
    await poller.runRound()
    await poller.runRound()
    expect(deps.remoteHead).toHaveBeenCalledTimes(1)
    advance(31 * MIN)
    await poller.runRound()
    expect(deps.remoteHead).toHaveBeenCalledTimes(2)
    expect(deps.probe).toHaveBeenCalledTimes(1)
  })

  it('does not run two rounds at once', async () => {
    let release = () => {}
    const { deps, poller } = setup([binding()], {
      remoteHead: vi.fn(
        () => new Promise<string>((resolve) => (release = () => resolve('new')))
      ),
    })
    const first = poller.runRound()
    await poller.runRound()
    release()
    await first
    expect(deps.remoteHead).toHaveBeenCalledTimes(1)
  })
})
