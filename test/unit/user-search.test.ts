import { beforeEach, describe, expect, it, vi } from 'vitest'

const db = vi.hoisted(() => ({
  rows: [] as Array<{
    id: number
    username: string
    nickname: string | null
    avatar: string | null
  }>,
  memberRows: [] as Array<{ userId: number }>,
  pendingRows: [] as Array<{ userId: number; payload: unknown }>,
  userQuery: null as Record<string, unknown> | null,
  memberQueries: 0,
  pendingQueries: 0,
}))

vi.mock('#server/libs/prisma', () => ({
  default: {
    user: {
      findMany: async (args: Record<string, unknown>) => {
        db.userQuery = args
        return db.rows
      },
    },
    userTeam: {
      findMany: async () => {
        db.memberQueries += 1
        return db.memberRows
      },
    },
    notification: {
      findMany: async () => {
        db.pendingQueries += 1
        return db.pendingRows
      },
    },
  },
}))

const {
  USER_SEARCH_LIMIT,
  candidateStatus,
  listMemberCandidates,
  normalizeSearchQuery,
  userSearchWhere,
} = await import('#server/helper/user-search')

describe('normalizeSearchQuery', () => {
  it('trims and keeps a usable query', () => {
    expect(normalizeSearchQuery('  bo  ')).toBe('bo')
  })

  it('rejects a single character', () => {
    expect(normalizeSearchQuery('b')).toBeNull()
  })

  it('rejects empty and non-string input', () => {
    expect(normalizeSearchQuery('')).toBeNull()
    expect(normalizeSearchQuery('   ')).toBeNull()
    expect(normalizeSearchQuery(undefined)).toBeNull()
    expect(normalizeSearchQuery(7)).toBeNull()
  })

  it('strips LIKE wildcards so contains means literal containment', () => {
    expect(normalizeSearchQuery('%bo%')).toBe('bo')
    expect(normalizeSearchQuery('_b_o_')).toBe('bo')
  })

  it('rejects a query that is nothing but wildcards', () => {
    expect(normalizeSearchQuery('%%')).toBeNull()
  })
})

describe('userSearchWhere', () => {
  it('matches a substring on username, nickname, and email', () => {
    expect(userSearchWhere('bo')).toEqual({
      OR: [
        { username: { contains: 'bo' } },
        { nickname: { contains: 'bo' } },
        { email: { contains: 'bo' } },
      ],
    })
  })

  it('never sets mode, which SQLite string filters do not support', () => {
    for (const clause of userSearchWhere('bo').OR) {
      expect(Object.values(clause)[0]).not.toHaveProperty('mode')
    }
  })
})

describe('candidateStatus', () => {
  const base = {
    userId: 5,
    actorUserId: 1,
    memberUserIds: [] as number[],
    pendingUserIds: [] as number[],
  }

  it('is invitable by default', () => {
    expect(candidateStatus(base)).toBe('invitable')
  })

  it('marks the caller themself', () => {
    expect(candidateStatus({ ...base, userId: 1 })).toBe('self')
  })

  it('marks somebody already on the team', () => {
    expect(candidateStatus({ ...base, memberUserIds: [5] })).toBe('member')
  })

  it('marks somebody already invited', () => {
    expect(candidateStatus({ ...base, pendingUserIds: [5] })).toBe('pending')
  })

  it('reports self ahead of the other two, matching the API check order', () => {
    expect(
      candidateStatus({
        ...base,
        userId: 1,
        memberUserIds: [1],
        pendingUserIds: [1],
      })
    ).toBe('self')
  })

  it('reports member ahead of pending, matching the API check order', () => {
    expect(
      candidateStatus({ ...base, memberUserIds: [5], pendingUserIds: [5] })
    ).toBe('member')
  })
})

describe('listMemberCandidates', () => {
  const bob = { id: 2, username: 'bob', nickname: null, avatar: null }
  const carol = { id: 3, username: 'carol', nickname: 'Carol', avatar: '/a.png' }

  beforeEach(() => {
    db.rows = [bob, carol]
    db.memberRows = []
    db.pendingRows = []
    db.userQuery = null
    db.memberQueries = 0
    db.pendingQueries = 0
  })

  it('selects fields explicitly and never email', async () => {
    await listMemberCandidates({ teamId: 7, actorUserId: 1, q: 'bo' })
    expect(db.userQuery?.select).toEqual({
      id: true,
      username: true,
      nickname: true,
      avatar: true,
    })
    expect(db.userQuery?.select).not.toHaveProperty('email')
  })

  it('caps the result count and orders deterministically', async () => {
    await listMemberCandidates({ teamId: 7, actorUserId: 1, q: 'bo' })
    expect(db.userQuery?.take).toBe(USER_SEARCH_LIMIT)
    // Without an explicit order the picker would reshuffle between keystrokes.
    expect(db.userQuery?.orderBy).toEqual({ username: 'asc' })
  })

  it('never puts an email on a returned candidate', async () => {
    const { candidates } = await listMemberCandidates({
      teamId: 7,
      actorUserId: 1,
      q: 'bo',
    })
    expect(candidates).toHaveLength(2)
    for (const candidate of candidates) {
      expect(candidate).not.toHaveProperty('email')
    }
  })

  it('resolves every status from one batched membership and pending lookup', async () => {
    db.rows = [bob, carol, { id: 4, username: 'dave', nickname: null, avatar: null }]
    db.memberRows = [{ userId: 3 }]
    db.pendingRows = [
      { userId: 4, payload: { teamId: 7 } },
      // Another team's invite must not mark this user as pending here.
      { userId: 2, payload: { teamId: 99 } },
    ]

    const { candidates } = await listMemberCandidates({
      teamId: 7,
      actorUserId: 2,
      q: 'bo',
    })

    expect(candidates.map((row) => [row.userId, row.status])).toEqual([
      [2, 'self'],
      [3, 'member'],
      [4, 'pending'],
    ])
    expect(db.memberQueries).toBe(1)
    expect(db.pendingQueries).toBe(1)
  })

  it('flags truncation when the cap is hit', async () => {
    db.rows = Array.from({ length: USER_SEARCH_LIMIT }, (_, index) => ({
      id: index + 1,
      username: `user${index}`,
      nickname: null,
      avatar: null,
    }))

    const result = await listMemberCandidates({
      teamId: 7,
      actorUserId: 999,
      q: 'user',
    })

    expect(result.truncated).toBe(true)
  })

  it('skips the follow-up lookups when nothing matched', async () => {
    db.rows = []

    const result = await listMemberCandidates({
      teamId: 7,
      actorUserId: 1,
      q: 'zz',
    })

    expect(result).toEqual({ candidates: [], truncated: false })
    expect(db.memberQueries).toBe(0)
    expect(db.pendingQueries).toBe(0)
  })
})