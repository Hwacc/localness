import { beforeEach, describe, expect, it, vi } from 'vitest'
import { JoinRequestStatus } from '#shared/constants'

const db = vi.hoisted(() => ({
  teams: [] as Array<{ id: number; name: string; _count: { members: number } }>,
  memberships: [] as Array<{ teamId: number }>,
  pendingRequests: [] as Array<{ teamId: number }>,
  teamArgs: null as Record<string, unknown> | null,
  followUpQueries: 0,
}))

vi.mock('#server/libs/prisma', () => ({
  default: {
    team: {
      findMany: async (args: Record<string, unknown>) => {
        db.teamArgs = args
        return db.teams
      },
    },
    userTeam: {
      findMany: async () => {
        db.followUpQueries += 1
        return db.memberships
      },
    },
    teamJoinRequest: {
      findMany: async () => {
        db.followUpQueries += 1
        return db.pendingRequests
      },
    },
  },
}))

const { listTeamSearch, teamSearchStatus } = await import(
  '#server/helper/team-search'
)

function teamRow(id: number, name: string, members = 3) {
  return { id, name, _count: { members } }
}

describe('teamSearchStatus', () => {
  it('prefers member over applied', () => {
    expect(
      teamSearchStatus({
        teamId: 7,
        memberTeamIds: [7],
        appliedTeamIds: [7],
      })
    ).toBe('member')
  })

  it('reports a live request as applied', () => {
    expect(
      teamSearchStatus({ teamId: 7, memberTeamIds: [], appliedTeamIds: [7] })
    ).toBe('applied')
  })

  // A rejected applicant is not in the pending list, so re-applying is open.
  it('reports a rejected applicant as none', () => {
    expect(
      teamSearchStatus({ teamId: 7, memberTeamIds: [], appliedTeamIds: [] })
    ).toBe('none')
  })
})

describe('listTeamSearch', () => {
  beforeEach(() => {
    db.teams = []
    db.memberships = []
    db.pendingRequests = []
    db.teamArgs = null
    db.followUpQueries = 0
  })

  it('returns status and member counts per row', async () => {
    db.teams = [teamRow(7, 'Alpha', 12), teamRow(8, 'Beta')]
    db.memberships = [{ teamId: 7 }]
    db.pendingRequests = []
    const res = await listTeamSearch({ userId: 1, q: 'al' })
    expect(res.teams).toEqual([
      { id: 7, name: 'Alpha', memberCount: 12, status: 'member' },
      { id: 8, name: 'Beta', memberCount: 3, status: 'none' },
    ])
    expect(res.truncated).toBe(false)
  })

  it('marks a pending request as applied', async () => {
    db.teams = [teamRow(8, 'Beta')]
    db.pendingRequests = [{ teamId: 8 }]
    const res = await listTeamSearch({ userId: 1, q: 'be' })
    expect(res.teams[0]?.status).toBe('applied')
    expect(db.pendingRequests.length).toBeGreaterThan(0)
  })

  it('orders by name then id and caps at the limit', async () => {
    db.teams = Array.from({ length: 20 }, (_, i) =>
      teamRow(i + 1, `Team ${String(i).padStart(2, '0')}`)
    )
    const res = await listTeamSearch({ userId: 1, q: 'Team' })
    expect(db.teamArgs).toMatchObject({
      orderBy: [{ name: 'asc' }, { id: 'asc' }],
      take: 20,
    })
    expect(res.truncated).toBe(true)
  })

  it('skips the follow-up queries on an empty result', async () => {
    db.teams = []
    const res = await listTeamSearch({ userId: 1, q: 'zz' })
    expect(res).toEqual({ teams: [], truncated: false })
    expect(db.followUpQueries).toBe(0)
  })

  it('asks for pending requests with the pending status only', async () => {
    db.teams = [teamRow(7, 'Alpha')]
    await listTeamSearch({ userId: 1, q: 'al' })
    expect(db.followUpQueries).toBe(2)
    expect(JoinRequestStatus.PENDING).toBe('pending')
  })
})
