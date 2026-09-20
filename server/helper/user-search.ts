import prisma from '#server/libs/prisma'
import { payloadTeamId } from '#server/helper/notifications'
import { NotificationAction, NotificationType } from '#shared/constants'
import type {
  ITeamMemberCandidate,
  ITeamMemberCandidates,
  TeamMemberCandidateStatus,
} from '#shared/types/Team'

/**
 * Finding someone to invite to a Team.
 *
 * A Team Owner used to have to type an exact `username`, which meant knowing
 * something nobody remembers. This searches username, nickname, and email so the
 * page can offer a picker instead.
 *
 * The rules live here rather than in the endpoint because `getQuery` and
 * `getRouterParam` are not in the unit-test h3 stub — anything left in the
 * `.get.ts` file would be untestable by construction.
 */

/** Shorter queries return nothing: one letter would list most of the platform. */
export const USER_SEARCH_MIN_LENGTH = 2

export const USER_SEARCH_LIMIT = 20

/**
 * The search term, or null when there is nothing worth querying.
 *
 * `%` and `_` are LIKE wildcards and `contains` compiles to `LIKE '%…%'`.
 * Whether Prisma escapes them has varied between versions, and dropping them
 * settles it for free — this is a name search, not a pattern language.
 */
export function normalizeSearchQuery(raw: unknown): string | null {
  if (typeof raw !== 'string') return null
  const q = raw.replace(/[%_]/g, '').trim()
  return q.length >= USER_SEARCH_MIN_LENGTH ? q : null
}

/**
 * Substring match over the three identifying fields.
 *
 * No `mode: 'insensitive'`: SQLite has no such option on string filters, and
 * plain `contains` is already case-insensitive for ASCII (SQLite's `LIKE` folds
 * A–Z only, so `Émile` will not match `émile`). Same behaviour the translations
 * search relies on.
 */
export function userSearchWhere(q: string) {
  return {
    OR: [
      { username: { contains: q } },
      { nickname: { contains: q } },
      { email: { contains: q } },
    ],
  }
}

/**
 * Which of the four states a searched user is in. Ordered the way the invite
 * endpoint checks them, so the list explains the same reason the API would
 * refuse with.
 */
export function candidateStatus(input: {
  userId: number
  actorUserId: number
  memberUserIds: number[]
  pendingUserIds: number[]
}): TeamMemberCandidateStatus {
  if (input.userId === input.actorUserId) return 'self'
  if (input.memberUserIds.includes(input.userId)) return 'member'
  if (input.pendingUserIds.includes(input.userId)) return 'pending'
  return 'invitable'
}

export async function listMemberCandidates(params: {
  teamId: number
  actorUserId: number
  q: string
}): Promise<ITeamMemberCandidates> {
  const users = await prisma.user.findMany({
    where: userSearchWhere(params.q),
    // `email` is absent on purpose: it is searched, never returned. Keep this an
    // explicit select — an `include` would leak it straight to the client.
    select: { id: true, username: true, nickname: true, avatar: true },
    // Explicit: SQLite does not promise an order otherwise, which would make the
    // picker reshuffle between keystrokes.
    orderBy: { username: 'asc' },
    take: USER_SEARCH_LIMIT,
  })
  if (users.length === 0) return { candidates: [], truncated: false }

  const userIds = users.map((user) => user.id)
  // Two batched lookups, never a membership check per row.
  const memberships = await prisma.userTeam.findMany({
    where: { teamId: params.teamId, userId: { in: userIds } },
    select: { userId: true },
  })
  const pending = await prisma.notification.findMany({
    where: {
      userId: { in: userIds },
      type: NotificationType.TEAM_INVITE,
      action: NotificationAction.PENDING,
    },
    select: { userId: true, payload: true },
  })

  const memberUserIds = memberships.map((row) => row.userId)
  // The Team id lives inside the JSON payload with no foreign key, so it has to
  // be read out in JS — same reason `payloadTeamId` exists at all.
  const pendingUserIds = pending
    .filter((row) => payloadTeamId(row.payload) === params.teamId)
    .map((row) => row.userId)

  const candidates: ITeamMemberCandidate[] = users.map((user) => ({
    userId: user.id,
    username: user.username,
    nickname: user.nickname,
    avatar: user.avatar,
    status: candidateStatus({
      userId: user.id,
      actorUserId: params.actorUserId,
      memberUserIds,
      pendingUserIds,
    }),
  }))

  return { candidates, truncated: users.length === USER_SEARCH_LIMIT }
}