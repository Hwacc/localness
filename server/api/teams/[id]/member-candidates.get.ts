import { numericID } from '#server/helper/id'
import { requireTeamOwner } from '#server/helper/access'
import {
  listMemberCandidates,
  normalizeSearchQuery,
} from '#server/helper/user-search'

/**
 * @route GET /api/teams/:id/member-candidates?q=
 * @description Search platform users who could be invited to this Team.
 *
 * Guarded by the same rule as the invite itself (`requireTeamOwner`), so the
 * search is exactly as wide as the action it feeds.
 *
 * A too-short or missing query is an empty 200, never a 4xx: the picker queries
 * on every keystroke and the client toasts every error response, so a 400 here
 * would flash an error toast per character typed.
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
  const q = normalizeSearchQuery(getQuery(event).q)
  if (!q) return { candidates: [], truncated: false }
  return listMemberCandidates({ teamId, actorUserId: userId, q })
})