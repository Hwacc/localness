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
    },
    user: {
      findUnique: async () => db.actingUser,
    },
    userTeam: {
      findUnique: async () => db.membership,
      create: async ({ data }: { data: Record<string, unknown> }) => {
        db.userTeamCreated = data
        return data
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
