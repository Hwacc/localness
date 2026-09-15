export type ProjectStewardInput = {
  userId: number
  ownerUserIds: number[]
}

export function isProjectSteward(input: ProjectStewardInput): boolean {
  return input.ownerUserIds.includes(input.userId)
}

export type AddProjectOwnerRejection =
  | 'not-member'
  | 'already-steward'
  | 'cannot-appoint'

export type RemoveProjectOwnerRejection =
  | 'not-listed'
  | 'last-owner'
  | 'cannot-appoint'

export function addProjectOwnerRejectReason(input: {
  actorCanAppoint: boolean
  targetUserId: number
  teamMemberIds: number[]
  ownerUserIds: number[]
}): AddProjectOwnerRejection | null {
  if (!input.actorCanAppoint) return 'cannot-appoint'
  if (!input.teamMemberIds.includes(input.targetUserId)) return 'not-member'
  if (input.ownerUserIds.includes(input.targetUserId)) return 'already-steward'
  return null
}

export function removeProjectOwnerRejectReason(input: {
  actorCanAppoint: boolean
  targetUserId: number
  ownerUserIds: number[]
}): RemoveProjectOwnerRejection | null {
  if (!input.actorCanAppoint) return 'cannot-appoint'
  if (!input.ownerUserIds.includes(input.targetUserId)) return 'not-listed'
  if (input.ownerUserIds.length <= 1) return 'last-owner'
  return null
}

export const ADD_PROJECT_OWNER_MESSAGES: Record<
  AddProjectOwnerRejection,
  string
> = {
  'cannot-appoint': 'Only a Project Owner or Admin can change Project Owners',
  'not-member': 'User is not a member of this team',
  'already-steward': 'User is already a Project Owner',
}

export const REMOVE_PROJECT_OWNER_MESSAGES: Record<
  RemoveProjectOwnerRejection,
  string
> = {
  'cannot-appoint': 'Only a Project Owner or Admin can change Project Owners',
  'not-listed': 'User is not a Project Owner',
  'last-owner': 'A project must keep at least one Project Owner',
}

export function ownerChangeStatus(
  reason: AddProjectOwnerRejection | RemoveProjectOwnerRejection
): 400 | 403 {
  switch (reason) {
    case 'cannot-appoint':
      return 403
    case 'not-member':
    case 'already-steward':
    case 'not-listed':
    case 'last-owner':
      return 400
    default: {
      const _exhaustive: never = reason
      return _exhaustive
    }
  }
}
