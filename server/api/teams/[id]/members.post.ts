import { numericID } from '#server/helper/id'
import { readZodBody } from '#server/helper/validate'
import { requireTeamOwner } from '#server/helper/access'
import {
  createTeamInviteNotification,
  throwNotificationHttp,
} from '#server/helper/notifications'
import { TeamRole } from '#shared/constants'
import { zTeamInviteMember } from '#shared/utils/schemas'

/**
 * @route POST /api/teams/:id/members
 * @description Send a pending team invite (OWNER). Does not add the member yet.
 *
 * The body names the invitee by id. The page picks them out of
 * `GET /api/teams/:id/member-candidates`, which searches username, nickname, and
 * email — only `username` is unique, so the picker's id is the key, not a string
 * typed by hand.
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
  const { userId: actorId } = await requireTeamOwner(event, teamId)
  const { userId: inviteeId, role } = await readZodBody(
    event,
    zTeamInviteMember.parse
  )
  try {
    const notification = await createTeamInviteNotification({
      teamId,
      invitedBy: actorId,
      userId: inviteeId,
      role: role ?? TeamRole.MEMBER,
    })
    return { ok: true, pending: true, notification }
  } catch (error) {
    throwNotificationHttp(error)
  }
})