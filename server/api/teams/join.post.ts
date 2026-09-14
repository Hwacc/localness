import { numericID } from '#server/helper/id'
import {
  redeemInviteCode,
  TeamInviteError,
  throwTeamInviteHttp,
} from '#server/helper/team-invite'
import {
  assertJoinNotRateLimited,
  clearJoinFailures,
  recordJoinFailure,
} from '#server/helper/join-rate-limit'
import { readZodBody } from '#server/helper/validate'
import { zTeamInviteJoin } from '#shared/utils/schemas'

/**
 * @route POST /api/teams/join
 * @description Redeem an invite code (any signed-in user; does not create accounts)
 */
export default defineEventHandler(async (event) => {
  const session = await requireUserSession(event)
  const userId = numericID(session.user.id)
  const { code } = await readZodBody(event, zTeamInviteJoin.parse)
  assertJoinNotRateLimited(event, userId)
  try {
    const result = await redeemInviteCode({ userId, code })
    clearJoinFailures(event, userId)
    return result
  } catch (error) {
    if (error instanceof TeamInviteError && error.statusCode === 404) {
      recordJoinFailure(event, userId)
    }
    throwTeamInviteHttp(error)
  }
})
