import type { ID } from '.'
import type { IUser } from './User'
import type { TeamRole } from '#shared/constants'

export interface ITeamMember {
  userId: ID
  teamId: ID
  role: TeamRole
  user?: IUser
}

export interface ITeam {
  id: ID
  name: string
  createdAt?: string
  updatedAt?: string
  members?: ITeamMember[]
  role?: TeamRole
}

export interface ITeamInviteCode {
  id: ID
  teamId: ID
  code: string
  role: TeamRole
  maxUses: number | null
  usedCount: number
  remainingUses: number | null
  expiresAt: string | null
  createdBy: ID
  createdAt: string
  revokedAt: string | null
}

/**
 * Why a searched user can or cannot be invited right now. Mirrors the server's
 * invite checks (self 400, already-on-team 409, already-pending 409) so the list
 * can say why instead of letting the OWNER pick somebody and eat the error.
 */
export type TeamMemberCandidateStatus =
  | 'invitable'
  | 'self'
  | 'member'
  | 'pending'

/**
 * A user a Team Owner may invite.
 *
 * Deliberately has no `email`: it is matched against, but must never be handed
 * back, so the type itself cannot carry one out of the server.
 */
export interface ITeamMemberCandidate {
  userId: ID
  username: string
  nickname: string | null
  avatar: string | null
  status: TeamMemberCandidateStatus
}

export interface ITeamMemberCandidates {
  candidates: ITeamMemberCandidate[]
  /** True when the search hit the result cap, so matches may be missing. */
  truncated: boolean
}
