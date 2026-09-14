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
