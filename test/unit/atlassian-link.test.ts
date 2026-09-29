import { describe, expect, it } from 'vitest'
import {
  isLinkExpired,
  matchLinkCandidates,
  pickLinkTarget,
  unbindRejectReason,
} from '#server/helper/atlassian-link'

const row = (
  id: number,
  email: string | null,
  over: Partial<{ passwordSetAt: Date | null; hasAtlassian: boolean }> = {}
) => ({
  id,
  email,
  passwordSetAt: new Date(),
  hasAtlassian: false,
  ...over,
})

describe('matchLinkCandidates', () => {
  it('matches the email case-insensitively and ignores padding', () => {
    expect(
      matchLinkCandidates([row(1, ' Alice@Corp.com ')], 'alice@corp.com')
    ).toEqual([1])
  })

  it('offers every account that carries the email', () => {
    expect(
      matchLinkCandidates(
        [row(1, 'a@corp.com'), row(2, 'a@corp.com'), row(3, 'b@corp.com')],
        'a@corp.com'
      )
    ).toEqual([1, 2])
  })

  it('skips an account with no password to confirm with', () => {
    expect(
      matchLinkCandidates(
        [row(1, 'a@corp.com', { passwordSetAt: null })],
        'a@corp.com'
      )
    ).toEqual([])
  })

  it('skips an account that already has an Atlassian account', () => {
    expect(
      matchLinkCandidates(
        [row(1, 'a@corp.com', { hasAtlassian: true })],
        'a@corp.com'
      )
    ).toEqual([])
  })

  it('never matches a blank email', () => {
    expect(matchLinkCandidates([row(1, null), row(2, '')], '')).toEqual([])
    expect(matchLinkCandidates([row(1, null)], 'a@corp.com')).toEqual([])
  })
})

describe('pickLinkTarget', () => {
  const one = [{ id: 1, username: 'alice' }]
  const two = [
    { id: 1, username: 'alice' },
    { id: 2, username: 'alice2' },
  ]

  it('needs no username when there is a single candidate', () => {
    expect(pickLinkTarget(one)?.id).toBe(1)
  })

  it('requires the username to name a candidate when there are several', () => {
    expect(pickLinkTarget(two)).toBeNull()
    expect(pickLinkTarget(two, 'alice2')?.id).toBe(2)
    expect(pickLinkTarget(two, 'stranger')).toBeNull()
  })

  it('does not reach past the candidates for a single one either', () => {
    expect(pickLinkTarget(one, 'someone-else')).toBeNull()
  })

  it('has nothing to pick from an empty list', () => {
    expect(pickLinkTarget([], 'alice')).toBeNull()
  })
})

describe('isLinkExpired', () => {
  it('expires at the deadline, not after it', () => {
    expect(isLinkExpired(1000, 999)).toBe(false)
    expect(isLinkExpired(1000, 1000)).toBe(true)
  })
})

describe('unbindRejectReason', () => {
  it('lets an account with a password disconnect', () => {
    expect(
      unbindRejectReason({ connected: true, hasPassword: true })
    ).toBeNull()
  })

  it('refuses when nothing is connected', () => {
    expect(unbindRejectReason({ connected: false, hasPassword: true })).toBe(
      'not-bound'
    )
  })

  it('refuses an account that would be left without any login', () => {
    expect(unbindRejectReason({ connected: true, hasPassword: false })).toBe(
      'no-password'
    )
  })
})
