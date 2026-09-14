import prisma from '#server/libs/prisma'
import { numericID } from '#server/helper/id'
import { requireTeamOwner } from '#server/helper/access'
import { readZodBody } from '#server/helper/validate'
import {
  DEFAULT_INVITE_MAX_USES,
  createUniqueInviteCode,
  defaultInviteExpiresAt,
  shapeInviteCode,
  throwTeamInviteHttp,
} from '#server/helper/team-invite'
import { TeamRole } from '#shared/constants'
import { zTeamInviteCodeCreate } from '#shared/utils/schemas'

function parseExpiresAt(raw: string | null | undefined): Date | null {
  if (raw === undefined) return defaultInviteExpiresAt()
  if (raw === null) return null
  const date = new Date(raw)
  if (Number.isNaN(date.getTime())) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Invalid expiresAt',
    })
  }
  return date
}

/**
 * @route POST /api/teams/:id/invite-codes
 * @description Create an invite code (OWNER)
 */
export default defineEventHandler(async (event) => {
  const id = getRouterParam(event, 'id')
  if (!id) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Missing team id',
    })
  }
  const teamId = numericID(id)
  const { userId } = await requireTeamOwner(event, teamId)
  const body = await readZodBody(event, zTeamInviteCodeCreate.parse)
  const role = body.role ?? TeamRole.MEMBER
  const maxUses =
    body.maxUses === undefined ? DEFAULT_INVITE_MAX_USES : body.maxUses
  const expiresAt = parseExpiresAt(body.expiresAt)

  try {
    const code = await createUniqueInviteCode(async (candidate) => {
      const existing = await prisma.teamInviteCode.findUnique({
        where: { code: candidate },
        select: { id: true },
      })
      return Boolean(existing)
    })
    const row = await prisma.teamInviteCode.create({
      data: {
        teamId,
        code,
        role,
        maxUses,
        createdBy: userId,
        expiresAt,
      },
    })
    return shapeInviteCode(row)
  } catch (error) {
    throwTeamInviteHttp(error)
  }
})
