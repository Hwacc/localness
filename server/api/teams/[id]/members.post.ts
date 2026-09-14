import { numericID } from '#server/helper/id'
import { readZodBody } from '#server/helper/validate'
import { requireTeamOwner } from '#server/helper/access'
import {
  createTeamInviteNotification,
  throwNotificationHttp,
} from '#server/helper/notifications'
import { TeamRole } from '#shared/constants'
import { z } from 'zod/v4'

const zInvite = z.object({
  username: z.string().min(1),
  role: z.enum([TeamRole.OWNER, TeamRole.MEMBER]).optional(),
})

/**
 * @route POST /api/teams/:id/members
 * @description Send a pending team invite (OWNER). Does not add the member yet.
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
  const { username, role } = await readZodBody(event, zInvite.parse)
  try {
    const notification = await createTeamInviteNotification({
      teamId,
      invitedBy: userId,
      username,
      role: role ?? TeamRole.MEMBER,
    })
    return { ok: true, pending: true, notification }
  } catch (error) {
    throwNotificationHttp(error)
  }
})
