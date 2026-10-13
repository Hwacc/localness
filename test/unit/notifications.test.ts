import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  NotificationAction,
  NotificationType,
  TeamRole,
  UserRole,
} from '#shared/constants'

const db = vi.hoisted(() => ({
  // Keyed by id because the invitee and the inviter are both looked up with
  // `where.id` now — a fake that discriminates by key name cannot tell them
  // apart, and would hand the invitee lookup the inviter's row.
  usersById: {} as Record<
    number,
    { id: number; username: string; nickname: string | null; role: string }
  >,
  membership: null as { role: string } | null,
  pending: [] as Array<{ payload: { teamId: number } }>,
  team: null as { name: string } | null,
  created: null as Record<string, unknown> | null,
  deleteArgs: null as Record<string, unknown> | null,
  userTeamCreated: null as Record<string, unknown> | null,
  membershipPairs: {} as Record<string, { role: string } | null>,
  joinRequest: null as {
    id: number
    teamId: number
    userId: number
    status: string
  } | null,
  joinRequestUpdateArgs: null as Record<string, unknown> | null,
  claimResult: null as { count: number } | null,
  txNotificationCreated: null as Record<string, unknown> | null,
  siblingPending: [] as Array<{ id: number; payload: Record<string, unknown> }>,
  siblingUpdateArgs: null as Record<string, unknown> | null,
  notification: null as {
    id: number
    userId: number
    type: string
    title: string
    body: string
    payload: Record<string, unknown>
    readAt: Date | null
    actedAt: Date | null
    action: string
    createdAt: Date
  } | null,
  actingUser: null as { role: string } | null,
}))

vi.mock('#server/libs/prisma', () => {
  const tx = {
    notification: {
      findFirst: async () => db.notification,
      update: async ({ data }: { data: Record<string, unknown> }) => {
        if (!db.notification) return null
        db.notification = {
          ...db.notification,
          ...data,
          actedAt: (data.actedAt as Date) ?? db.notification.actedAt,
          readAt: (data.readAt as Date | null) ?? db.notification.readAt,
          action: String(data.action ?? db.notification.action),
        }
        return db.notification
      },
      findMany: async () => db.siblingPending,
      create: async ({ data }: { data: Record<string, unknown> }) => {
        db.txNotificationCreated = data
        return { id: 99, ...data }
      },
      updateMany: async ({ where }: { where: Record<string, unknown> }) => {
        db.siblingUpdateArgs = where
        return { count: db.siblingPending.length }
      },
    },
    user: {
      findUnique: async () => db.actingUser,
    },
    userTeam: {
      findUnique: async ({
        where,
      }: {
        where?: { userId_teamId?: { teamId: number; userId: number } }
      } = {}) => {
        const pair = where?.userId_teamId
        if (pair) {
          const key = `${pair.teamId}:${pair.userId}`
          if (key in db.membershipPairs) return db.membershipPairs[key]
        }
        return db.membership
      },
      create: async ({ data }: { data: Record<string, unknown> }) => {
        db.userTeamCreated = data
        return data
      },
    },
    teamJoinRequest: {
      findUnique: async () => db.joinRequest,
      updateMany: async ({
        where,
        data,
      }: {
        where: Record<string, unknown>
        data: Record<string, unknown>
      }) => {
        db.joinRequestUpdateArgs = { where, data }
        if (db.claimResult) return db.claimResult
        if (!db.joinRequest) return { count: 0 }
        db.joinRequest = { ...db.joinRequest, ...data }
        return { count: 1 }
      },
    },
  }
  return {
    default: {
      user: {
        findUnique: async ({ where }: { where: { id?: number } }) =>
          where.id == null ? null : (db.usersById[where.id] ?? null),
      },
      userTeam: {
        findUnique: async () => db.membership,
      },
      team: {
        findUnique: async () => db.team,
      },
      notification: {
        findMany: async () => db.pending,
        count: async () => db.pending.length,
        deleteMany: async ({ where }: { where: Record<string, unknown> }) => {
          db.deleteArgs = where
          return { count: 0 }
        },
        create: async ({ data }: { data: Record<string, unknown> }) => {
          db.created = data
          return {
            id: 1,
            userId: data.userId,
            type: data.type,
            title: data.title,
            body: data.body,
            payload: data.payload,
            readAt: null,
            actedAt: null,
            action: data.action,
            createdAt: new Date('2026-09-14T00:00:00.000Z'),
          }
        },
      },
      $transaction: async (fn: (client: typeof tx) => Promise<unknown>) =>
        fn(tx),
    },
  }
})

const {
  NotificationError,
  actOnNotification,
  createTeamInviteNotification,
  deleteNotifications,
} = await import('#server/helper/notifications')

describe('createTeamInviteNotification', () => {
  beforeEach(() => {
    db.usersById = {
      1: { id: 1, username: 'alice', nickname: 'Alice', role: UserRole.USER },
      2: { id: 2, username: 'bob', nickname: null, role: UserRole.USER },
    }
    db.membership = null
    db.pending = []
    db.team = { name: 'Alpha' }
    db.created = null
  })

  it('creates a pending TEAM_INVITE', async () => {
    const row = await createTeamInviteNotification({
      teamId: 7,
      invitedBy: 1,
      userId: 2,
      role: TeamRole.MEMBER,
    })
    expect(row.action).toBe(NotificationAction.PENDING)
    expect(db.created).toMatchObject({
      userId: 2,
      type: NotificationType.TEAM_INVITE,
      action: NotificationAction.PENDING,
    })
  })

  it('rejects an id that resolves to nobody', async () => {
    delete db.usersById[2]
    await expect(
      createTeamInviteNotification({
        teamId: 7,
        invitedBy: 1,
        userId: 2,
        role: TeamRole.MEMBER,
      })
    ).rejects.toMatchObject({ statusCode: 404 })
  })

  it('rejects inviting yourself', async () => {
    await expect(
      createTeamInviteNotification({
        teamId: 7,
        invitedBy: 1,
        userId: 1,
        role: TeamRole.MEMBER,
      })
    ).rejects.toMatchObject({
      statusCode: 400,
      message: 'You cannot invite yourself',
    })
  })

  it('rejects someone already on the team', async () => {
    db.membership = { role: TeamRole.OWNER }
    await expect(
      createTeamInviteNotification({
        teamId: 7,
        invitedBy: 1,
        userId: 2,
        role: TeamRole.MEMBER,
      })
    ).rejects.toMatchObject({
      statusCode: 409,
      message: 'User is already on this team',
    })
  })

  it('rejects a duplicate pending invite', async () => {
    db.pending = [{ payload: { teamId: 7 } }]
    await expect(
      createTeamInviteNotification({
        teamId: 7,
        invitedBy: 1,
        userId: 2,
        role: TeamRole.MEMBER,
      })
    ).rejects.toMatchObject({
      statusCode: 409,
      message: 'Invite already pending',
    })
  })
})

describe('deleteNotifications', () => {
  beforeEach(() => {
    db.pending = []
    db.deleteArgs = null
  })

  it('scopes the delete to the owner even when ids are given', async () => {
    await deleteNotifications(2, [4, 5])
    // Without the userId clause, ids guessed off another account would delete
    // rows that user never owned.
    expect(db.deleteArgs).toEqual({ userId: 2, id: { in: [4, 5] } })
  })

  it('deletes the whole Inbox when no ids are given', async () => {
    await deleteNotifications(2)
    expect(db.deleteArgs).toEqual({ userId: 2 })
  })

  it('returns the refreshed list and pending count', async () => {
    const result = await deleteNotifications(2, [4])
    expect(result).toEqual({ items: [], pendingCount: 0 })
  })
})

describe('actOnNotification', () => {
  beforeEach(() => {
    db.membership = null
    db.userTeamCreated = null
    db.actingUser = { role: UserRole.USER }
    db.notification = {
      id: 4,
      userId: 2,
      type: NotificationType.TEAM_INVITE,
      title: 'Team invite',
      body: 'Alice invited you to Alpha as MEMBER',
      payload: {
        teamId: 7,
        teamName: 'Alpha',
        role: TeamRole.MEMBER,
        invitedBy: 1,
        invitedByName: 'Alice',
      },
      readAt: null,
      actedAt: null,
      action: NotificationAction.PENDING,
      createdAt: new Date('2026-09-14T00:00:00.000Z'),
    }
  })

  it('accepts and creates UserTeam', async () => {
    const row = await actOnNotification({
      userId: 2,
      notificationId: 4,
      action: NotificationAction.ACCEPTED,
    })
    expect(row.action).toBe(NotificationAction.ACCEPTED)
    expect(db.userTeamCreated).toEqual({
      userId: 2,
      teamId: 7,
      role: TeamRole.MEMBER,
    })
  })

  it('declines without creating membership', async () => {
    const row = await actOnNotification({
      userId: 2,
      notificationId: 4,
      action: NotificationAction.DECLINED,
    })
    expect(row.action).toBe(NotificationAction.DECLINED)
    expect(db.userTeamCreated).toBeNull()
  })

  it('rejects a missing or already acted notification', async () => {
    db.notification = null
    await expect(
      actOnNotification({
        userId: 2,
        notificationId: 4,
        action: NotificationAction.ACCEPTED,
      })
    ).rejects.toBeInstanceOf(NotificationError)

    db.notification = {
      id: 4,
      userId: 2,
      type: NotificationType.TEAM_INVITE,
      title: 'Team invite',
      body: '',
      payload: {},
      readAt: null,
      actedAt: null,
      action: NotificationAction.DECLINED,
      createdAt: new Date(),
    }
    await expect(
      actOnNotification({
        userId: 2,
        notificationId: 4,
        action: NotificationAction.ACCEPTED,
      })
    ).rejects.toMatchObject({ statusCode: 404 })
  })
})

describe('actOnNotification — TEAM_JOIN_REQUEST', () => {
  const actingOwner = 1
  const applicant = 9

  function seedOwnerRow() {
    db.notification = {
      id: 30,
      userId: actingOwner,
      type: NotificationType.TEAM_JOIN_REQUEST,
      title: 'Join request',
      body: 'Bob applied to join Alpha',
      payload: {
        teamId: 7,
        teamName: 'Alpha',
        applicantId: applicant,
        applicantName: 'Bob',
      },
      readAt: null,
      actedAt: null,
      action: NotificationAction.PENDING,
      createdAt: new Date('2026-10-13T00:00:00.000Z'),
    }
  }

  beforeEach(() => {
    seedOwnerRow()
    db.membership = null
    db.membershipPairs = {
      '7:1': { role: TeamRole.OWNER },
      '7:9': null,
    }
    db.joinRequest = { id: 11, teamId: 7, userId: applicant, status: 'pending' }
    db.joinRequestUpdateArgs = null
    db.claimResult = null
    db.userTeamCreated = null
    db.txNotificationCreated = null
    db.siblingPending = []
    db.siblingUpdateArgs = null
    db.actingUser = { role: UserRole.USER }
  })

  it('approves: claims the request, adds MEMBER, notifies the applicant', async () => {
    const row = await actOnNotification({
      userId: actingOwner,
      notificationId: 30,
      action: NotificationAction.ACCEPTED,
    })
    expect(row.action).toBe(NotificationAction.ACCEPTED)
    expect(db.joinRequest?.status).toBe('approved')
    expect(db.joinRequestUpdateArgs?.where).toMatchObject({ id: 11 })
    expect(db.userTeamCreated).toEqual({
      userId: applicant,
      teamId: 7,
      role: TeamRole.MEMBER,
    })
    expect(db.txNotificationCreated).toMatchObject({
      userId: applicant,
      type: NotificationType.TEAM_JOIN_APPROVED,
      action: NotificationAction.NONE,
    })
  })

  it('declines: marks rejected and notifies without a membership', async () => {
    await actOnNotification({
      userId: actingOwner,
      notificationId: 30,
      action: NotificationAction.DECLINED,
    })
    expect(db.joinRequest?.status).toBe('rejected')
    expect(db.userTeamCreated).toBeNull()
    expect(db.txNotificationCreated).toMatchObject({
      type: NotificationType.TEAM_JOIN_REJECTED,
    })
  })

  it('rejects an actor no longer on the team', async () => {
    db.membershipPairs['7:1'] = null
    await expect(
      actOnNotification({
        userId: actingOwner,
        notificationId: 30,
        action: NotificationAction.ACCEPTED,
      })
    ).rejects.toMatchObject({ statusCode: 403 })
  })

  it('rejects a MEMBER acting on the request', async () => {
    db.membershipPairs['7:1'] = { role: TeamRole.MEMBER }
    await expect(
      actOnNotification({
        userId: actingOwner,
        notificationId: 30,
        action: NotificationAction.ACCEPTED,
      })
    ).rejects.toMatchObject({ statusCode: 403 })
  })

  it('rejects an already-decided request', async () => {
    db.joinRequest = { id: 11, teamId: 7, userId: applicant, status: 'approved' }
    await expect(
      actOnNotification({
        userId: actingOwner,
        notificationId: 30,
        action: NotificationAction.ACCEPTED,
      })
    ).rejects.toMatchObject({ statusCode: 409 })
  })

  it('rejects when another owner claimed it first', async () => {
    db.claimResult = { count: 0 }
    await expect(
      actOnNotification({
        userId: actingOwner,
        notificationId: 30,
        action: NotificationAction.ACCEPTED,
      })
    ).rejects.toMatchObject({ statusCode: 409 })
  })

  it('rejects when the request row is gone', async () => {
    db.joinRequest = null
    await expect(
      actOnNotification({
        userId: actingOwner,
        notificationId: 30,
        action: NotificationAction.ACCEPTED,
      })
    ).rejects.toMatchObject({ statusCode: 404 })
  })

  it('approves without a duplicate membership', async () => {
    db.membershipPairs['7:9'] = { role: TeamRole.MEMBER }
    await actOnNotification({
      userId: actingOwner,
      notificationId: 30,
      action: NotificationAction.ACCEPTED,
    })
    expect(db.joinRequest?.status).toBe('approved')
    expect(db.userTeamCreated).toBeNull()
  })

  it('resolves sibling owners’ pending rows for the same request only', async () => {
    db.siblingPending = [
      { id: 31, payload: { teamId: 7, applicantId: applicant } },
      { id: 32, payload: { teamId: 8, applicantId: applicant } },
    ]
    await actOnNotification({
      userId: actingOwner,
      notificationId: 30,
      action: NotificationAction.ACCEPTED,
    })
    expect(db.siblingUpdateArgs).toMatchObject({ id: { in: [31] } })
  })
})
