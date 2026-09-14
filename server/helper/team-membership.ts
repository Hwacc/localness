import { TeamRole } from '#shared/constants'

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
 * so deleting a Team can never destroy translation data as a side effect. An
 * OWNER who wants out of a Team with projects deletes the projects first, which
 * is an explicit act.
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
