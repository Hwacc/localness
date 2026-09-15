import { randomBytes } from 'node:crypto'
import prisma from '#server/libs/prisma'

export const INVITE_CODE_LENGTH = 10
export const INVITE_CODE_ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ'
export const DEFAULT_INVITE_MAX_USES = 20
export const DEFAULT_INVITE_TTL_MS = 14 * 24 * 60 * 60 * 1000
export const INVALID_INVITE_MESSAGE = 'Invalid or expired invite code'

const GENERATE_ATTEMPTS = 8

export class TeamInviteError extends Error {
  constructor(
    public statusCode: number,
    message: string
  ) {
    super(message)
    this.name = 'TeamInviteError'
  }
}

export function generateInviteCode(
  bytes: (size: number) => Buffer = randomBytes
): string {
  const raw = bytes(INVITE_CODE_LENGTH)
  let code = ''
  for (let i = 0; i < INVITE_CODE_LENGTH; i++) {
    code += INVITE_CODE_ALPHABET[raw[i]! % INVITE_CODE_ALPHABET.length]
  }
  return code
}

export function normalizeInviteCode(raw: string): string {
  return raw.replace(/[\s-]/g, '').toUpperCase()
}

export function defaultInviteExpiresAt(now = new Date()): Date {
  return new Date(now.getTime() + DEFAULT_INVITE_TTL_MS)
}

type InviteRow = {
  id: number
  teamId: number
  role: string
  maxUses: number | null
  usedCount: number
  expiresAt: Date | null
  revokedAt: Date | null
}

export function inviteCodeRejectReason(
  row: InviteRow | null,
  now = new Date()
): 'missing' | 'revoked' | 'expired' | 'exhausted' | null {
  if (!row) return 'missing'
  if (row.revokedAt) return 'revoked'
  if (row.expiresAt && row.expiresAt.getTime() <= now.getTime()) return 'expired'
  if (row.maxUses != null && row.usedCount >= row.maxUses) return 'exhausted'
  return null
}

const teamInclude = {
  members: {
    include: {
      user: {
        omit: {
          password: true,
          createdAt: true,
          updatedAt: true,
        },
      },
    },
  },
  _count: { select: { projects: true } },
} as const

export async function createUniqueInviteCode(
  exists: (code: string) => Promise<boolean>
): Promise<string> {
  for (let i = 0; i < GENERATE_ATTEMPTS; i++) {
    const code = generateInviteCode()
    if (!(await exists(code))) return code
  }
  throw new TeamInviteError(500, 'Failed to generate a unique invite code')
}

export async function redeemInviteCode(params: {
  userId: number
  code: string
  now?: Date
}) {
  const code = normalizeInviteCode(params.code)
  const now = params.now ?? new Date()

  return prisma.$transaction(async (tx) => {
    const user = await tx.user.findUnique({
      where: { id: params.userId },
      select: { id: true },
    })
    if (!user) {
      throw new TeamInviteError(404, INVALID_INVITE_MESSAGE)
    }

    const invite = await tx.teamInviteCode.findUnique({
      where: { code },
    })
    const reject = inviteCodeRejectReason(invite, now)
    if (!invite || reject) {
      throw new TeamInviteError(404, INVALID_INVITE_MESSAGE)
    }

    const membership = await tx.userTeam.findUnique({
      where: {
        userId_teamId: { userId: params.userId, teamId: invite.teamId },
      },
    })
    const team = await tx.team.findUniqueOrThrow({
      where: { id: invite.teamId },
      include: teamInclude,
    })

    if (membership) {
      return {
        alreadyMember: true as const,
        role: membership.role,
        team: { ...team, role: membership.role },
      }
    }

    const created = await tx.userTeam.create({
      data: {
        userId: params.userId,
        teamId: invite.teamId,
        role: invite.role,
      },
    })
    await tx.teamInviteCode.update({
      where: { id: invite.id },
      data: { usedCount: { increment: 1 } },
    })
    const joined = await tx.team.findUniqueOrThrow({
      where: { id: invite.teamId },
      include: teamInclude,
    })
    return {
      alreadyMember: false as const,
      role: created.role,
      team: { ...joined, role: created.role },
    }
  })
}

export function throwTeamInviteHttp(error: unknown): never {
  if (error instanceof TeamInviteError) {
    throw createError({
      statusCode: error.statusCode,
      statusMessage: error.message,
    })
  }
  throw error
}

export function remainingUses(maxUses: number | null, usedCount: number) {
  if (maxUses == null) return null
  return Math.max(0, maxUses - usedCount)
}

export function shapeInviteCode(row: {
  id: number
  teamId: number
  code: string
  role: string
  maxUses: number | null
  usedCount: number
  expiresAt: Date | null
  createdBy: number
  createdAt: Date
  revokedAt: Date | null
}) {
  return {
    id: row.id,
    teamId: row.teamId,
    code: row.code,
    role: row.role,
    maxUses: row.maxUses,
    usedCount: row.usedCount,
    remainingUses: remainingUses(row.maxUses, row.usedCount),
    expiresAt: row.expiresAt?.toISOString() ?? null,
    createdBy: row.createdBy,
    createdAt: row.createdAt.toISOString(),
    revokedAt: row.revokedAt?.toISOString() ?? null,
  }
}
