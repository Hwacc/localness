import { TeamRole } from '#shared/constants'

export type ProjectStewardInput = {
  userId: number
  teamRole: string | null | undefined
  ownerUserIds: number[]
}

export function isImplicitProjectSteward(
  teamRole: string | null | undefined
): boolean {
  return teamRole === TeamRole.OWNER
}

export function isProjectSteward(input: ProjectStewardInput): boolean {
  if (isImplicitProjectSteward(input.teamRole)) return true
  return input.ownerUserIds.includes(input.userId)
}

export type AddProjectOwnerRejection =
  | 'not-member'
  | 'already-steward'
  | 'not-team-owner'

export type RemoveProjectOwnerRejection =
  | 'not-listed'
  | 'implicit-team-owner'
  | 'not-team-owner'

export function addProjectOwnerRejectReason(input: {
  actorIsTeamOwner: boolean
  targetUserId: number
  teamMemberIds: number[]
  teamRoleByUserId: Record<number, string>
  ownerUserIds: number[]
}): AddProjectOwnerRejection | null {
  if (!input.actorIsTeamOwner) return 'not-team-owner'
  if (!input.teamMemberIds.includes(input.targetUserId)) return 'not-member'
  if (
    isProjectSteward({
      userId: input.targetUserId,
      teamRole: input.teamRoleByUserId[input.targetUserId],
      ownerUserIds: input.ownerUserIds,
    })
  ) {
    return 'already-steward'
  }
  return null
}

export function removeProjectOwnerRejectReason(input: {
  actorIsTeamOwner: boolean
  targetUserId: number
  teamRoleByUserId: Record<number, string>
  ownerUserIds: number[]
}): RemoveProjectOwnerRejection | null {
  if (!input.actorIsTeamOwner) return 'not-team-owner'
  if (isImplicitProjectSteward(input.teamRoleByUserId[input.targetUserId])) {
    return 'implicit-team-owner'
  }
  if (!input.ownerUserIds.includes(input.targetUserId)) return 'not-listed'
  return null
}

export const ADD_PROJECT_OWNER_MESSAGES: Record<
  AddProjectOwnerRejection,
  string
> = {
  'not-team-owner': 'Only a Team OWNER can change Project Owners',
  'not-member': 'User is not a member of this team',
  'already-steward': 'User is already a Project Owner',
}

export const REMOVE_PROJECT_OWNER_MESSAGES: Record<
  RemoveProjectOwnerRejection,
  string
> = {
  'not-team-owner': 'Only a Team OWNER can change Project Owners',
  'not-listed': 'User is not a Project Owner',
  'implicit-team-owner': 'A Team OWNER always remains a Project Owner',
}
