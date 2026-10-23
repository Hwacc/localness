import prisma from '#server/libs/prisma'
import { JoinRequestStatus } from '#shared/constants'
import type {
  ITeamSearchResult,
  ITeamSearchResults,
  TeamSearchStatus,
} from '#shared/types/Team'

/**
 * Finding a team to apply to — the mirror of `user-search.ts`, for anyone
 * logged in rather than for an OWNER. Shares `normalizeSearchQuery` so both
 * searches strip LIKE wildcards and bail on short terms the same way.
 *
 * Rules live here rather than in the endpoint for the same reason as the user
 * search: `getQuery` is not in the unit-test h3 stub.
 */

export const TEAM_SEARCH_LIMIT = 20

export function teamSearchWhere(q: string) {
  return { name: { contains: q } }
}

/**
 * The caller's relationship to a team, in the order the apply endpoint checks
 * them: a member cannot apply, a live request blocks a second one, and a
 * rejected applicant is free to apply again.
 */
export function teamSearchStatus(input: {
  teamId: number
  memberTeamIds: number[]
  appliedTeamIds: number[]
}): TeamSearchStatus {
  if (input.memberTeamIds.includes(input.teamId)) return 'member'
  if (input.appliedTeamIds.includes(input.teamId)) return 'applied'
  return 'none'
}

export async function listTeamSearch(params: {
  userId: number
  q: string
}): Promise<ITeamSearchResults> {
  const teams = await prisma.team.findMany({
    where: teamSearchWhere(params.q),
    select: { id: true, name: true, _count: { select: { members: true } } },
    // Explicit: SQLite does not promise an order otherwise, which would make
    // the result list reshuffle between keystrokes.
    orderBy: [{ name: 'asc' }, { id: 'asc' }],
    take: TEAM_SEARCH_LIMIT,
  })
  if (teams.length === 0) return { teams: [], truncated: false }

  const teamIds = teams.map((team) => team.id)
  // Two batched lookups, never a membership check per row.
  const memberships = await prisma.userTeam.findMany({
    where: { userId: params.userId, teamId: { in: teamIds } },
    select: { teamId: true },
  })
  const pending = await prisma.teamJoinRequest.findMany({
    where: {
      userId: params.userId,
      teamId: { in: teamIds },
      status: JoinRequestStatus.PENDING,
    },
    select: { teamId: true },
  })

  const memberTeamIds = memberships.map((row) => row.teamId)
  const appliedTeamIds = pending.map((row) => row.teamId)

  const results: ITeamSearchResult[] = teams.map((team) => ({
    id: team.id,
    name: team.name,
    memberCount: team._count.members,
    status: teamSearchStatus({
      teamId: team.id,
      memberTeamIds,
      appliedTeamIds,
    }),
  }))

  return { teams: results, truncated: teams.length === TEAM_SEARCH_LIMIT }
}
