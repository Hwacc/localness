import { JoinRequestStatus, TeamRole } from '#shared/constants'

/**
 * Membership rules for a Team, as pure functions over the current member list.
 *
 * A Team may have more than one OWNER, and every rule here exists to protect one
 * invariant: **a Team never ends up with zero OWNERs**. Otherwise nobody could
 * create projects, invite, promote, or delete it — and no endpoint can recover
 * it, because every team-management route requires an OWNER.
 *
 * Keeping the rules here rather than inline in the handlers means the promote /
 * demote / remove / leave paths cannot drift apart: they all consult the same
 * counter.
 */

export type TeamMemberRow = {
  userId: number
  role: string
}

export type RoleChangeRejection = 'not-member' | 'unchanged' | 'last-owner'
export type MemberRemovalRejection = 'not-member' | 'last-owner'
export type TeamDeleteRejection = 'not-member' | 'has-members' | 'has-projects'

function ownerCount(members: TeamMemberRow[]): number {
  return members.filter((m) => m.role === TeamRole.OWNER).length
}

function find(members: TeamMemberRow[], userId: number) {
  return members.find((m) => m.userId === userId) ?? null
}

/**
 * Why changing `targetUserId`'s role to `nextRole` must be refused, or null when
 * allowed. Promotion is never blocked; only a demotion that would drop the last
 * OWNER is.
 */
export function roleChangeRejectReason(
  members: TeamMemberRow[],
  targetUserId: number,
  nextRole: TeamRole
): RoleChangeRejection | null {
  const target = find(members, targetUserId)
  if (!target) return 'not-member'
  if (target.role === nextRole) return 'unchanged'
  if (target.role === TeamRole.OWNER && ownerCount(members) <= 1) {
    return 'last-owner'
  }
  return null
}

/**
 * Why removing `targetUserId` must be refused, or null when allowed. Shared by
 * an OWNER removing someone and a member leaving on their own, so "the last
 * OWNER cannot walk out" holds for both.
 */
export function memberRemovalRejectReason(
  members: TeamMemberRow[],
  targetUserId: number
): MemberRemovalRejection | null {
  const target = find(members, targetUserId)
  if (!target) return 'not-member'
  if (target.role === TeamRole.OWNER && ownerCount(members) <= 1) {
    return 'last-owner'
  }
  return null
}

/**
 * Why deleting the Team must be refused, or null when allowed.
 *
 * This is the escape hatch for the one case `memberRemovalRejectReason` cannot
 * resolve: a sole OWNER with nobody to promote first. It is deliberately narrow
 * — the actor must be the only member left, and the Team must hold no projects,
 * so deleting a Team can never destroy translation data as a side effect. That
 * leaves an OWNER who wants out of a Team that holds projects with no path at
 * all: `TEAM_DELETE_MESSAGES['has-projects']` tells them to delete the projects
 * first, but nothing in this codebase can delete a project yet.
 */
export function teamDeleteRejectReason(
  members: TeamMemberRow[],
  projectCount: number,
  actorUserId: number
): TeamDeleteRejection | null {
  if (!find(members, actorUserId)) return 'not-member'
  if (members.length > 1) return 'has-members'
  if (projectCount > 0) return 'has-projects'
  return null
}

export type JoinRequestApplyRejection = 'already-member' | 'already-pending' | 'no-owner'
export type JoinRequestDecideRejection = 'missing' | 'not-owner' | 'already-decided'

/**
 * Why applying to this team must be refused, or null when allowed. A rejected
 * request may be reset and re-applied, so only a live `pending` blocks. The
 * owner check fails closed: the invariant says a team always has one, but if
 * the data ever says otherwise the request would be undecidable forever.
 */
export function joinRequestApplyRejectReason(input: {
  isMember: boolean
  existingStatus: JoinRequestStatus | null
  ownerCount: number
}): JoinRequestApplyRejection | null {
  if (input.isMember) return 'already-member'
  if (input.existingStatus === JoinRequestStatus.PENDING) return 'already-pending'
  if (input.ownerCount <= 0) return 'no-owner'
  return null
}

/**
 * Why deciding this request must be refused, or null when allowed. The role is
 * re-checked at decision time: an OWNER demoted after the notification was
 * sent still holds the pending row in their inbox.
 */
export function joinRequestDecideRejectReason(
  request: { status: string } | null,
  actorRole: string | null
): JoinRequestDecideRejection | null {
  if (!request) return 'missing'
  if (actorRole !== TeamRole.OWNER) return 'not-owner'
  if (request.status !== JoinRequestStatus.PENDING) return 'already-decided'
  return null
}

export const ROLE_CHANGE_MESSAGES: Record<RoleChangeRejection, string> = {
  'not-member': 'Member not found',
  unchanged: 'Member already has this role',
  'last-owner': 'A team must keep at least one OWNER',
}

export const MEMBER_REMOVAL_MESSAGES: Record<MemberRemovalRejection, string> = {
  'not-member': 'Member not found',
  'last-owner': 'A team must keep at least one OWNER',
}

export const TEAM_DELETE_MESSAGES: Record<TeamDeleteRejection, string> = {
  'not-member': 'Member not found',
  'has-members': 'Remove the other members before deleting this team',
  'has-projects': 'Delete this team’s projects before deleting the team',
}

export const JOIN_REQUEST_APPLY_MESSAGES: Record<JoinRequestApplyRejection, string> = {
  'already-member': 'You are already on this team',
  'already-pending': 'Request already pending',
  'no-owner': 'This team has no owner to approve the request',
}

export const JOIN_REQUEST_DECIDE_MESSAGES: Record<JoinRequestDecideRejection, string> = {
  missing: 'Join request not found',
  'not-owner': 'Only a team owner can decide join requests',
  'already-decided': 'Request already decided',
}
