import { numericID } from '#server/helper/id'
import {
  applyToTeamJoinRequest,
  throwJoinRequestHttp,
} from '#server/helper/team-join-request'

/**
 * @route POST /api/teams/:id/join-requests
 * @description Ask to join a team (any signed-in user). Each OWNER gets a
 * pending inbox notification; accepting one decides the request.
 *
 * Reads no body on purpose: the team comes from the path and the applicant
 * from the session, so there is nothing to validate.
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
  const session = await requireUserSession(event)
  const userId = numericID(session.user.id)
  try {
    await applyToTeamJoinRequest({ userId, teamId })
    return { ok: true, pending: true }
  } catch (error) {
    throwJoinRequestHttp(error)
  }
})
