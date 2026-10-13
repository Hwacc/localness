import { numericID } from '#server/helper/id'
import { normalizeSearchQuery } from '#server/helper/user-search'
import { listTeamSearch } from '#server/helper/team-search'

/**
 * @route GET /api/teams/search?q=
 * @description Search every team on the instance, for any signed-in user.
 *
 * Unlike `GET /api/teams` (which lists only your own), this is the discovery
 * surface behind "Find a team". Results carry the caller's status — member,
 * applied, or free to apply — so the page renders the right button without a
 * second round trip.
 *
 * A too-short or missing query is an empty 200, never a 4xx — same reason as
 * member-candidates: the box queries on every keystroke and the client toasts
 * every error response.
 */
export default defineEventHandler(async (event) => {
  const session = await requireUserSession(event)
  const userId = numericID(session.user.id)
  const q = normalizeSearchQuery(getQuery(event).q)
  if (!q) return { teams: [], truncated: false }
  return listTeamSearch({ userId, q })
})
