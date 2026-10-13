import prisma from '#server/libs/prisma'
import type { TeamJoinRequestPayload } from '#server/helper/notifications'
import {
  JOIN_REQUEST_APPLY_MESSAGES,
  joinRequestApplyRejectReason,
} from '#server/helper/team-membership'
import {
  JoinRequestStatus,
  NotificationAction,
  NotificationType,
  TeamRole,
} from '#shared/constants'

/**
 * The applicant side of joining a team. The decision side lives in
 * `actOnNotification` (notifications.ts) — applying creates the request row
 * and one PENDING notification per OWNER; accepting one of those notifications
 * is what decides it.
 */

export class JoinRequestError extends Error {
  constructor(
    public statusCode: number,
    message: string
  ) {
    super(message)
    this.name = 'JoinRequestError'
  }
}

export function throwJoinRequestHttp(error: unknown): never {
  if (error instanceof JoinRequestError) {
    throw createError({
      statusCode: error.statusCode,
      statusMessage: error.message,
    })
  }
  throw error
}

export async function applyToTeamJoinRequest(params: {
  userId: number
  teamId: number
}) {
  const team = await prisma.team.findUnique({
    where: { id: params.teamId },
    select: { id: true, name: true },
  })
  if (!team) {
    throw new JoinRequestError(404, 'Team not found')
  }
  const applicant = await prisma.user.findUnique({
    where: { id: params.userId },
    select: { username: true, nickname: true },
  })
  if (!applicant) {
    throw new JoinRequestError(404, 'User not found')
  }
  const applicantName = applicant.nickname || applicant.username

  return prisma.$transaction(async (tx) => {
    const membership = await tx.userTeam.findUnique({
      where: {
        userId_teamId: { userId: params.userId, teamId: params.teamId },
      },
    })
    const existing = await tx.teamJoinRequest.findUnique({
      where: {
        teamId_userId: { teamId: params.teamId, userId: params.userId },
      },
    })
    const owners = await tx.userTeam.findMany({
      where: { teamId: params.teamId, role: TeamRole.OWNER },
      select: { userId: true },
    })

    const reason = joinRequestApplyRejectReason({
      isMember: membership != null,
      existingStatus: existing ? (existing.status as JoinRequestStatus) : null,
      ownerCount: owners.length,
    })
    if (reason) {
      throw new JoinRequestError(409, JOIN_REQUEST_APPLY_MESSAGES[reason])
    }

    // A decided row resets instead of a second one being created — one row per
    // (team, user) is the invariant the unique index enforces.
    let request
    if (existing) {
      request = await tx.teamJoinRequest.update({
        where: { id: existing.id },
        data: {
          status: JoinRequestStatus.PENDING,
          decidedAt: null,
          decidedBy: null,
        },
      })
    } else {
      try {
        request = await tx.teamJoinRequest.create({
          data: { teamId: params.teamId, userId: params.userId },
        })
      } catch (error) {
        // P2002: a concurrent apply won the unique (teamId, userId) race.
        if ((error as { code?: string }).code === 'P2002') {
          throw new JoinRequestError(
            409,
            JOIN_REQUEST_APPLY_MESSAGES['already-pending']
          )
        }
        throw error
      }
    }

    const payload: TeamJoinRequestPayload = {
      teamId: team.id,
      teamName: team.name,
      applicantId: params.userId,
      applicantName,
    }
    if (owners.length > 0) {
      await tx.notification.createMany({
        data: owners.map((owner) => ({
          userId: owner.userId,
          type: NotificationType.TEAM_JOIN_REQUEST,
          title: 'Join request',
          body: `${applicantName} applied to join ${team.name}`,
          payload,
          action: NotificationAction.PENDING,
        })),
      })
    }

    return request
  })
}
