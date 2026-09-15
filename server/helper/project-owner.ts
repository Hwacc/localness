export type ProjectStewardInput = {
  userId: number
  ownerUserIds: number[]
}

export type ProjectOwnerRoster = {
  projectId: number
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

export function projectsLeftWithoutOwner(input: {
  targetUserId: number
  projects: ProjectOwnerRoster[]
}): number[] {
  return input.projects
    .filter(
      (project) =>
        project.ownerUserIds.includes(input.targetUserId) &&
        project.ownerUserIds.length <= 1
    )
    .map((project) => project.projectId)
}

const LAST_PROJECT_OWNER_RULE = 'A project must keep at least one Project Owner'

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
  'last-owner': LAST_PROJECT_OWNER_RULE,
}

/**
 * Refusal text for a Team exit that would strand projects. Names them, because
 * "appoint another owner first" is only actionable if the user is told which
 * project to open.
 */
export function strandedProjectMessage(projectNames: string[]): string {
  return `${LAST_PROJECT_OWNER_RULE}: appoint another owner for ${projectNames.join(', ')}`
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
