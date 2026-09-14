import { beforeEach, describe, expect, it, vi } from 'vitest'
import { TeamRole, UserRole } from '#shared/constants'

const db = vi.hoisted(() => ({
  user: null as { id: number; role: string } | null,
  invite: null as {
    id: number
    teamId: number
    role: string
    maxUses: number | null
    usedCount: number
    expiresAt: Date | null
    revokedAt: Date | null
    code: string
  } | null,
  membership: null as { role: string } | null,
  team: {
    id: 1,
    name: 'Alpha',
    members: [],
    _count: { projects: 0 },
  },
  created: null as Record<string, unknown> | null,
  usedIncrements: 0,
}))

vi.mock('#server/libs/prisma', () => {
  const tx = {
    user: {
      findUnique: async () => db.user,
    },
    teamInviteCode: {
      findUnique: async () => db.invite,
      update: async () => {
        db.usedIncrements += 1
        return {}
      },
    },
    userTeam: {
      findUnique: async () => db.membership,
      create: async ({ data }: { data: Record<string, unknown> }) => {
        db.created = data
        return data
      },
    },
    team: {
      findUniqueOrThrow: async () => db.team,
    },
  }
  return {
    default: {
      $transaction: async (fn: (client: typeof tx) => Promise<unknown>) =>
        fn(tx),
    },
  }
})

const {
  generateInviteCode,
  INVITE_CODE_ALPHABET,
  INVITE_CODE_LENGTH,
  INVALID_INVITE_MESSAGE,
  TeamInviteError,
  inviteCodeRejectReason,
  normalizeInviteCode,
  redeemInviteCode,
} = await import('#server/helper/team-invite')

function invite(overrides: Partial<NonNullable<typeof db.invite>> = {}) {
  return {
    id: 9,
    teamId: 1,
    role: TeamRole.MEMBER,
    maxUses: 20,
    usedCount: 0,
    expiresAt: new Date('2026-12-01T00:00:00.000Z'),
    revokedAt: null,
    code: 'ABC123DEF0',
    ...overrides,
  }
}

describe('generateInviteCode / normalizeInviteCode', () => {
  it('emits 10 Crockford characters', () => {
    const code = generateInviteCode(() => Buffer.alloc(10, 1))
    expect(code).toHaveLength(INVITE_CODE_LENGTH)
    expect([...code].every((ch) => INVITE_CODE_ALPHABET.includes(ch))).toBe(
      true
    )
  })

  it('strips spaces and dashes and uppercases', () => {
    expect(normalizeInviteCode(' ab-c1 ')).toBe('ABC1')
  })
})

describe('inviteCodeRejectReason', () => {
  const now = new Date('2026-09-14T00:00:00.000Z')

  it('rejects missing, revoked, expired, and exhausted codes', () => {
    expect(inviteCodeRejectReason(null, now)).toBe('missing')
    expect(
      inviteCodeRejectReason(invite({ revokedAt: now }), now)
    ).toBe('revoked')
    expect(
      inviteCodeRejectReason(
        invite({ expiresAt: new Date('2026-09-13T00:00:00.000Z') }),
        now
      )
    ).toBe('expired')
    expect(
      inviteCodeRejectReason(invite({ maxUses: 2, usedCount: 2 }), now)
    ).toBe('exhausted')
  })

  it('allows unlimited and unexpired codes', () => {
    expect(
      inviteCodeRejectReason(invite({ maxUses: null, expiresAt: null }), now)
    ).toBeNull()
  })
})

describe('redeemInviteCode', () => {
  const now = new Date('2026-09-14T00:00:00.000Z')

  beforeEach(() => {
    db.user = { id: 2, role: UserRole.USER }
    db.invite = invite()
    db.membership = null
    db.created = null
    db.usedIncrements = 0
  })

  it('rejects an unknown code', async () => {
    db.invite = null
    await expect(
      redeemInviteCode({ userId: 2, code: 'nope', now })
    ).rejects.toMatchObject({
      statusCode: 404,
      message: INVALID_INVITE_MESSAGE,
    })
    expect(db.usedIncrements).toBe(0)
  })

  it('rejects a revoked code', async () => {
    db.invite = invite({ revokedAt: now })
    await expect(
      redeemInviteCode({ userId: 2, code: 'abc123def0', now })
    ).rejects.toBeInstanceOf(TeamInviteError)
  })

  it('rejects an expired code', async () => {
    db.invite = invite({ expiresAt: new Date('2026-01-01T00:00:00.000Z') })
    await expect(
      redeemInviteCode({ userId: 2, code: 'ABC123DEF0', now })
    ).rejects.toMatchObject({ statusCode: 404 })
  })

  it('rejects an exhausted code', async () => {
    db.invite = invite({ maxUses: 1, usedCount: 1 })
    await expect(
      redeemInviteCode({ userId: 2, code: 'ABC123DEF0', now })
    ).rejects.toMatchObject({ statusCode: 404 })
  })

  it('rejects a GUEST without incrementing uses', async () => {
    db.user = { id: 2, role: UserRole.GUEST }
    await expect(
      redeemInviteCode({ userId: 2, code: 'ABC123DEF0', now })
    ).rejects.toMatchObject({
      statusCode: 400,
      message: 'GUEST cannot join a team',
    })
    expect(db.usedIncrements).toBe(0)
  })

  it('returns alreadyMember without changing role or uses', async () => {
    db.membership = { role: TeamRole.MEMBER }
    db.invite = invite({ role: TeamRole.OWNER })
    const result = await redeemInviteCode({ userId: 2, code: 'ABC123DEF0', now })
    expect(result.alreadyMember).toBe(true)
    expect(result.role).toBe(TeamRole.MEMBER)
    expect(db.created).toBeNull()
    expect(db.usedIncrements).toBe(0)
  })

  it('joins a new member and increments usedCount', async () => {
    db.invite = invite({ role: TeamRole.OWNER })
    const result = await redeemInviteCode({ userId: 2, code: 'ab-c123def0', now })
    expect(result).toMatchObject({
      alreadyMember: false,
      role: TeamRole.OWNER,
    })
    expect(db.created).toEqual({
      userId: 2,
      teamId: 1,
      role: TeamRole.OWNER,
    })
    expect(db.usedIncrements).toBe(1)
  })
})
