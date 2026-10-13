import prisma from '#server/libs/prisma'
import {
  JOIN_REQUEST_DECIDE_MESSAGES,
  joinRequestDecideRejectReason,
} from '#server/helper/team-membership'
import {
  JoinRequestStatus,
  NotificationAction,
  NotificationType,
  TeamRole,
} from '#shared/constants'

export class NotificationError extends Error {
  constructor(
    public statusCode: number,
    message: string
  ) {
    super(message)
    this.name = 'NotificationError'
  }
}

export type TeamInvitePayload = {
  teamId: number
  teamName: string
  role: TeamRole
  invitedBy: number
  invitedByName: string
}

export function throwNotificationHttp(error: unknown): never {
  if (error instanceof NotificationError) {
    throw createError({
      statusCode: error.statusCode,
      statusMessage: error.message,
    })
  }
  throw error
}

export type TeamJoinRequestPayload = {
  teamId: number
  teamName: string
  applicantId: number
  applicantName: string
}

export function parseTeamJoinRequestPayload(raw: unknown): TeamJoinRequestPayload {
  if (!raw || typeof raw !== 'object') {
    throw new NotificationError(500, 'Invalid join request payload')
  }
  const value = raw as Record<string, unknown>
  const teamId = Number(value.teamId)
  const applicantId = Number(value.applicantId)
  if (!Number.isInteger(teamId) || !Number.isInteger(applicantId)) {
    throw new NotificationError(500, 'Invalid join request payload')
  }
  return {
    teamId,
    teamName: String(value.teamName ?? ''),
    applicantId,
    applicantName: String(value.applicantName ?? ''),
  }
}

export function parseTeamInvitePayload(raw: unknown): TeamInvitePayload {
  if (!raw || typeof raw !== 'object') {
    throw new NotificationError(500, 'Invalid invite payload')
  }
  const value = raw as Record<string, unknown>
  const role = value.role
  if (role !== TeamRole.OWNER && role !== TeamRole.MEMBER) {
    throw new NotificationError(500, 'Invalid invite payload')
  }
  const teamId = Number(value.teamId)
  const invitedBy = Number(value.invitedBy)
  if (!Number.isInteger(teamId) || !Number.isInteger(invitedBy)) {
    throw new NotificationError(500, 'Invalid invite payload')
  }
  return {
    teamId,
    teamName: String(value.teamName ?? ''),
    role,
    invitedBy,
    invitedByName: String(value.invitedByName ?? ''),
  }
}

export function shapeNotification(row: {
  id: number
  userId: number
  type: string
  title: string
  body: string
  payload: unknown
  readAt: Date | null
  actedAt: Date | null
  action: string
  createdAt: Date
}) {
  return {
    id: row.id,
    userId: row.userId,
    type: row.type,
    title: row.title,
    body: row.body,
    payload: row.payload,
    readAt: row.readAt?.toISOString() ?? null,
    actedAt: row.actedAt?.toISOString() ?? null,
    action: row.action,
    createdAt: row.createdAt.toISOString(),
  }
}

/**
 * Exported because `payload` is JSON with no foreign key, so a caller that
 * deletes a Team has to find its pending invites by reading them.
 */
export function payloadTeamId(payload: unknown): number | null {
  if (!payload || typeof payload !== 'object') return null
  const teamId = Number((payload as { teamId?: unknown }).teamId)
  return Number.isInteger(teamId) ? teamId : null
}

/** Same JSON-without-FK reason as `payloadTeamId`: finds one applicant's rows. */
export function payloadApplicantId(payload: unknown): number | null {
  if (!payload || typeof payload !== 'object') return null
  const applicantId = Number((payload as { applicantId?: unknown }).applicantId)
  return Number.isInteger(applicantId) ? applicantId : null
}

export async function createTeamInviteNotification(params: {
  teamId: number
  invitedBy: number
  userId: number
  role: TeamRole
}) {
  // By id, not username: the page resolves a search hit (username, nickname, or
  // email) to a user before calling this, and only `username` is unique.
  const invitee = await prisma.user.findUnique({
    where: { id: params.userId },
    select: { id: true },
  })
  if (!invitee) {
    throw new NotificationError(404, 'User not found')
  }
  if (invitee.id === params.invitedBy) {
    throw new NotificationError(400, 'You cannot invite yourself')
  }

  const membership = await prisma.userTeam.findUnique({
    where: {
      userId_teamId: { userId: invitee.id, teamId: params.teamId },
    },
  })
  if (membership) {
    throw new NotificationError(409, 'User is already on this team')
  }

  const pending = await prisma.notification.findMany({
    where: {
      userId: invitee.id,
      type: NotificationType.TEAM_INVITE,
      action: NotificationAction.PENDING,
    },
  })
  if (pending.some((row) => payloadTeamId(row.payload) === params.teamId)) {
    throw new NotificationError(409, 'Invite already pending')
  }

  const team = await prisma.team.findUnique({
    where: { id: params.teamId },
    select: { name: true },
  })
  if (!team) {
    throw new NotificationError(404, 'Team not found')
  }
  const inviter = await prisma.user.findUnique({
    where: { id: params.invitedBy },
    select: { username: true, nickname: true },
  })
  const invitedByName = inviter?.nickname || inviter?.username || 'A teammate'
  const payload: TeamInvitePayload = {
    teamId: params.teamId,
    teamName: team.name,
    role: params.role,
    invitedBy: params.invitedBy,
    invitedByName,
  }

  const row = await prisma.notification.create({
    data: {
      userId: invitee.id,
      type: NotificationType.TEAM_INVITE,
      title: 'Team invite',
      body: `${invitedByName} invited you to ${team.name} as ${params.role}`,
      payload,
      action: NotificationAction.PENDING,
    },
  })
  return shapeNotification(row)
}

export async function listNotifications(
  userId: number,
  options: { pendingOnly?: boolean } = {}
) {
  const rows = await prisma.notification.findMany({
    where: {
      userId,
      ...(options.pendingOnly
        ? { action: NotificationAction.PENDING }
        : {}),
    },
    orderBy: { createdAt: 'desc' },
  })
  const pendingCount = options.pendingOnly
    ? rows.length
    : await prisma.notification.count({
        where: { userId, action: NotificationAction.PENDING },
      })
  return {
    items: rows.map(shapeNotification),
    pendingCount,
  }
}

export async function markNotificationsRead(
  userId: number,
  ids?: number[]
) {
  const now = new Date()
  await prisma.notification.updateMany({
    where: {
      userId,
      readAt: null,
      ...(ids?.length ? { id: { in: ids } } : {}),
    },
    data: { readAt: now },
  })
  return listNotifications(userId)
}

/**
 * Remove notifications from an Inbox. Hard delete is safe here because nothing
 * reads a row back: `pendingCount` is a live count, and `actOnNotification`
 * rejects anything no longer PENDING.
 *
 * Deleting a *pending* invite is effectively a silent decline — the "already
 * pending" check keys off the row existing, so the block is released with no
 * "Declined" trace left behind.
 */
export async function deleteNotifications(userId: number, ids?: number[]) {
  await prisma.notification.deleteMany({
    where: {
      // Scoped by userId, so ids guessed off another account delete nothing.
      userId,
      ...(ids?.length ? { id: { in: ids } } : {}),
    },
  })
  return listNotifications(userId)
}

/**
 * Only PENDING-action types are actionable; the NONE-action types
 * (TEAM_JOIN_APPROVED / TEAM_JOIN_REJECTED) are rejected by the guard below
 * before the switch, so they get no case.
 */
type ActableNotificationType = NotificationType.TEAM_INVITE | NotificationType.TEAM_JOIN_REQUEST

export async function actOnNotification(params: {
  userId: number
  notificationId: number
  action: NotificationAction.ACCEPTED | NotificationAction.DECLINED
}) {
  return prisma.$transaction(async (tx) => {
    const row = await tx.notification.findFirst({
      where: { id: params.notificationId, userId: params.userId },
    })
    if (!row || row.action !== NotificationAction.PENDING) {
      throw new NotificationError(404, 'Notification not found')
    }

    const type = row.type as ActableNotificationType
    switch (type) {
      case NotificationType.TEAM_INVITE: {
        if (params.action === NotificationAction.ACCEPTED) {
          const payload = parseTeamInvitePayload(row.payload)
          const existing = await tx.userTeam.findUnique({
            where: {
              userId_teamId: {
                userId: params.userId,
                teamId: payload.teamId,
              },
            },
          })
          if (!existing) {
            await tx.userTeam.create({
              data: {
                userId: params.userId,
                teamId: payload.teamId,
                role: payload.role,
              },
            })
          }
        }
        break
      }
      case NotificationType.TEAM_JOIN_REQUEST: {
        const payload = parseTeamJoinRequestPayload(row.payload)
        const membership = await tx.userTeam.findUnique({
          where: {
            userId_teamId: { userId: params.userId, teamId: payload.teamId },
          },
        })
        const request = await tx.teamJoinRequest.findUnique({
          where: {
            teamId_userId: {
              teamId: payload.teamId,
              userId: payload.applicantId,
            },
          },
        })
        if (!request) {
          throw new NotificationError(404, JOIN_REQUEST_DECIDE_MESSAGES.missing)
        }
        const reason = joinRequestDecideRejectReason(request, membership?.role ?? null)
        if (reason) {
          throw new NotificationError(
            reason === 'not-owner' ? 403 : 409,
            JOIN_REQUEST_DECIDE_MESSAGES[reason]
          )
        }

        const approved = params.action === NotificationAction.ACCEPTED
        // Claim first: each owner holds their own notification row, so the
        // PENDING guard above serializes nothing — this UPDATE is the race.
        const claimed = await tx.teamJoinRequest.updateMany({
          where: { id: request.id, status: JoinRequestStatus.PENDING },
          data: {
            status: approved
              ? JoinRequestStatus.APPROVED
              : JoinRequestStatus.REJECTED,
            decidedAt: new Date(),
            decidedBy: params.userId,
          },
        })
        if (claimed.count === 0) {
          throw new NotificationError(
            409,
            JOIN_REQUEST_DECIDE_MESSAGES['already-decided']
          )
        }

        if (approved) {
          const existing = await tx.userTeam.findUnique({
            where: {
              userId_teamId: {
                userId: payload.applicantId,
                teamId: payload.teamId,
              },
            },
          })
          if (!existing) {
            await tx.userTeam.create({
              data: {
                userId: payload.applicantId,
                teamId: payload.teamId,
                role: TeamRole.MEMBER,
              },
            })
          }
        }

        // The applicant hears either way (locked decision).
        await tx.notification.create({
          data: {
            userId: payload.applicantId,
            type: approved
              ? NotificationType.TEAM_JOIN_APPROVED
              : NotificationType.TEAM_JOIN_REJECTED,
            title: 'Join request',
            body: `Your request to join ${payload.teamName} was ${approved ? 'approved' : 'rejected'}`,
            payload: { teamId: payload.teamId, teamName: payload.teamName },
            action: NotificationAction.NONE,
          },
        })

        // Sibling owners' pending rows for the same request resolve too —
        // otherwise their Approve buttons stay live and only ever 409.
        const siblings = await tx.notification.findMany({
          where: {
            userId: { not: params.userId },
            type: NotificationType.TEAM_JOIN_REQUEST,
            action: NotificationAction.PENDING,
          },
          select: { id: true, payload: true },
        })
        const siblingIds = siblings
          .filter(
            (n) =>
              payloadTeamId(n.payload) === payload.teamId &&
              payloadApplicantId(n.payload) === payload.applicantId
          )
          .map((n) => n.id)
        if (siblingIds.length > 0) {
          await tx.notification.updateMany({
            where: { id: { in: siblingIds } },
            data: { action: params.action, actedAt: new Date() },
          })
        }
        break
      }
      default: {
        const _exhaustive: never = type
        throw new NotificationError(400, `Unsupported notification: ${_exhaustive}`)
      }
    }

    const updated = await tx.notification.update({
      where: { id: row.id },
      data: {
        action: params.action,
        actedAt: new Date(),
        readAt: row.readAt ?? new Date(),
      },
    })
    return shapeNotification(updated)
  })
}
