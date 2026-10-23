import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  JoinRequestStatus,
  NotificationAction,
  NotificationType,
  TeamRole,
} from '#shared/constants'

const db = vi.hoisted(() => ({
  team: null as { id: number; name: string } | null,
  usersById: {} as Record<
    number,
    { username: string; nickname: string | null }
  >,
  membership: null as { role: string } | null,
  existingRequest: null as { id: number; status: string } | null,
  ownerRows: [] as Array<{ userId: number }>,
  createdRequest: null as Record<string, unknown> | null,
  updatedRequest: null as Record<string, unknown> | null,
  createThrows: null as unknown,
  notificationsCreatedMany: [] as Array<Record<string, unknown>>,
}))

vi.mock('#server/libs/prisma', () => {
  const tx = {
    userTeam: {
      findUnique: async () => db.membership,
      findMany: async () => db.ownerRows,
    },
    teamJoinRequest: {
      findUnique: async () => db.existingRequest,
      update: async ({ data }: { data: Record<string, unknown> }) => {
        db.updatedRequest = data
        return { ...db.existingRequest, ...data }
      },
      create: async () => {
        if (db.createThrows) throw db.createThrows
        db.createdRequest = { id: 11, status: JoinRequestStatus.PENDING }
        return db.createdRequest
      },
    },
    notification: {
      createMany: async ({
        data,
      }: {
        data: Array<Record<string, unknown>>
      }) => {
        db.notificationsCreatedMany = data
        return { count: data.length }
      },
    },
  }
  return {
    default: {
      team: {
        findUnique: async () => db.team,
      },
      user: {
        findUnique: async ({ where }: { where: { id: number } }) =>
          db.usersById[where.id] ?? null,
      },
      $transaction: async (fn: (client: typeof tx) => Promise<unknown>) =>
        fn(tx),
    },
  }
})

const { applyToTeamJoinRequest } = await import(
  '#server/helper/team-join-request'
)

describe('applyToTeamJoinRequest', () => {
  beforeEach(() => {
    db.team = { id: 7, name: 'Alpha' }
    db.usersById = { 9: { username: 'bob', nickname: 'Bob' } }
    db.membership = null
    db.existingRequest = null
    db.ownerRows = [{ userId: 1 }, { userId: 2 }]
    db.createdRequest = null
    db.updatedRequest = null
    db.createThrows = null
    db.notificationsCreatedMany = []
  })

  it('creates a pending request and notifies every owner', async () => {
    const row = await applyToTeamJoinRequest({ userId: 9, teamId: 7 })
    expect(row.status).toBe(JoinRequestStatus.PENDING)
    expect(db.notificationsCreatedMany).toHaveLength(2)
    expect(db.notificationsCreatedMany[0]).toMatchObject({
      type: NotificationType.TEAM_JOIN_REQUEST,
      action: NotificationAction.PENDING,
      title: 'Join request',
      body: 'Bob applied to join Alpha',
      payload: {
        teamId: 7,
        teamName: 'Alpha',
        applicantId: 9,
        applicantName: 'Bob',
      },
    })
  })

  it('rejects a member', async () => {
    db.membership = { role: TeamRole.MEMBER }
    await expect(
      applyToTeamJoinRequest({ userId: 9, teamId: 7 }),
    ).rejects.toMatchObject({ statusCode: 409 })
  })

  it('rejects a second pending request', async () => {
    db.existingRequest = { id: 11, status: JoinRequestStatus.PENDING }
    await expect(
      applyToTeamJoinRequest({ userId: 9, teamId: 7 }),
    ).rejects.toMatchObject({
      statusCode: 409,
      message: 'Request already pending',
    })
  })

  it('resets a rejected row instead of creating a second one', async () => {
    db.existingRequest = { id: 11, status: JoinRequestStatus.REJECTED }
    await applyToTeamJoinRequest({ userId: 9, teamId: 7 })
    expect(db.createdRequest).toBeNull()
    expect(db.updatedRequest).toMatchObject({
      status: JoinRequestStatus.PENDING,
      decidedAt: null,
      decidedBy: null,
    })
    expect(db.notificationsCreatedMany).toHaveLength(2)
  })

  it('resets an approved row whose membership is gone', async () => {
    db.existingRequest = { id: 11, status: JoinRequestStatus.APPROVED }
    await applyToTeamJoinRequest({ userId: 9, teamId: 7 })
    expect(db.updatedRequest).toMatchObject({
      status: JoinRequestStatus.PENDING,
    })
  })

  it('rejects a team with no owner', async () => {
    db.ownerRows = []
    await expect(
      applyToTeamJoinRequest({ userId: 9, teamId: 7 }),
    ).rejects.toMatchObject({
      statusCode: 409,
      message: 'This team has no owner to approve the request',
    })
  })

  it('rejects a missing team', async () => {
    db.team = null
    await expect(
      applyToTeamJoinRequest({ userId: 9, teamId: 7 }),
    ).rejects.toMatchObject({ statusCode: 404 })
  })

  it('maps a lost unique race to a pending 409', async () => {
    db.createThrows = Object.assign(new Error('unique'), { code: 'P2002' })
    await expect(
      applyToTeamJoinRequest({ userId: 9, teamId: 7 }),
    ).rejects.toMatchObject({
      statusCode: 409,
      message: 'Request already pending',
    })
  })

  it('passes other create errors through', async () => {
    db.createThrows = new Error('boom')
    await expect(
      applyToTeamJoinRequest({ userId: 9, teamId: 7 }),
    ).rejects.toBeInstanceOf(Error)
  })
})
