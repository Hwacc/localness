import prisma from '#server/libs/prisma'
import { numericID } from '#server/helper/id'
import { requireTeamOwner } from '#server/helper/access'
import { readZodBody } from '#server/helper/validate'
import {
  ROLE_CHANGE_MESSAGES,
  roleChangeRejectReason,
} from '#server/helper/team-membership'
import { TeamRole } from '#shared/constants'
import { z } from 'zod/v4'

const zRoleChange = z.object({
  role: z.enum([TeamRole.OWNER, TeamRole.MEMBER]),
})

/**
 * @route PATCH /api/teams/:id/members/:userId
 * @description Promote a MEMBER to OWNER or demote an OWNER (Team Owner).
 *
 * Separate from the invite route on purpose: inviting somebody already on the
 * team is a 409 and never changes their role, so role changes need their own
 * endpoint. No inbox step — the target already consented to joining this team,
 * and a role change inside it is an owner's call.
 */
export default defineEventHandler(async (event) => {
  const id = getRouterParam(event, 'id')
  const userIdParam = getRouterParam(event, 'userId')
  if (!id || !userIdParam) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Missing id',
    })
  }
  const teamId = numericID(id)
  const targetUserId = numericID(userIdParam)
  await requireTeamOwner(event, teamId)
  const { role } = await readZodBody(event, zRoleChange.parse)

  const members = await prisma.userTeam.findMany({
    where: { teamId },
    select: { userId: true, role: true },
  })
  const reason = roleChangeRejectReason(members, targetUserId, role)
  if (reason) {
    throw createError({
      statusCode: reason === 'not-member' ? 404 : 400,
      statusMessage: ROLE_CHANGE_MESSAGES[reason],
    })
  }

  await prisma.userTeam.update({
    where: {
      userId_teamId: { userId: targetUserId, teamId },
    },
    data: { role },
  })
  return { ok: true, role }
})
