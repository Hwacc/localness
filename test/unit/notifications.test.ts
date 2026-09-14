import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  NotificationAction,
  NotificationType,
  TeamRole,
  UserRole,
} from '#shared/constants'

const db = vi.hoisted(() => ({
  invitee: null as { id: number; role: string; username: string } | null,
  membership: null as { role: string } | null,
  pending: [] as Array<{ payload: { teamId: number } }>,
  team: null as { name: string } | null,
  inviter: null as { username: string; nickname: string | null } | null,
  created: null as Record<string, unknown> | null,
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
        findUnique: async ({
          where,
        }: {
          where: { username?: string; id?: number }
        }) => {
          if (where.username) return db.invitee
          if (where.id) return db.inviter
          return null
        },
      },
      userTeam: {
        findUnique: async () => db.membership,
      },
      team: {
        findUnique: async () => db.team,
      },
      notification: {
        findMany: async () => db.pending,
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
} = await import('#server/helper/notifications')

describe('createTeamInviteNotification', () => {
  beforeEach(() => {
    db.invitee = { id: 2, role: UserRole.USER, username: 'bob' }
    db.membership = null
    db.pending = []
    db.team = { name: 'Alpha' }
    db.inviter = { username: 'alice', nickname: 'Alice' }
    db.created = null
  })

  it('creates a pending TEAM_INVITE', async () => {
    const row = await createTeamInviteNotification({
      teamId: 7,
      invitedBy: 1,
      username: 'bob',
      role: TeamRole.MEMBER,
    })
    expect(row.action).toBe(NotificationAction.PENDING)
    expect(db.created).toMatchObject({
      userId: 2,
      type: NotificationType.TEAM_INVITE,
      action: NotificationAction.PENDING,
    })
  })

  it('rejects a missing user', async () => {
    db.invitee = null
    await expect(
      createTeamInviteNotification({
        teamId: 7,
        invitedBy: 1,
        username: 'ghost',
        role: TeamRole.MEMBER,
      })
    ).rejects.toMatchObject({ statusCode: 404 })
  })

  it('rejects a GUEST', async () => {
    db.invitee = { id: 2, role: UserRole.GUEST, username: 'guest' }
    await expect(
      createTeamInviteNotification({
        teamId: 7,
        invitedBy: 1,
        username: 'guest',
        role: TeamRole.MEMBER,
      })
    ).rejects.toMatchObject({
      statusCode: 400,
      message: 'GUEST cannot join a team',
    })
  })

  it('rejects someone already on the team', async () => {
    db.membership = { role: TeamRole.OWNER }
    await expect(
      createTeamInviteNotification({
        teamId: 7,
        invitedBy: 1,
        username: 'bob',
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
        username: 'bob',
        role: TeamRole.MEMBER,
      })
    ).rejects.toMatchObject({
      statusCode: 409,
      message: 'Invite already pending',
    })
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
