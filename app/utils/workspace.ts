import { TeamRole } from '#shared/constants'

export const WORKSPACE_TEAM_KEY = 'workspace:teamId'
export const WORKSPACE_PROJECT_KEY = 'workspace:projectId'
export const WORKSPACE_PAGES_KEY = 'workspace:pageByProject'

export function emptyProject(partial: Partial<IProject> = {}): IProject {
  return {
    id: 0,
    name: '',
    description: '',
    pages: [],
    users: [],
    ...partial,
  }
}

export function emptyPage(partial: Partial<IPage> = {}): IPage {
  return {
    id: 0,
    name: '',
    tags: [],
    image: '',
    settings: {
      ocrLanguage: 'eng',
      ocrEngine: 1,
      prompt: '',
    },
    ...partial,
  }
}

export function readWorkspaceIds() {
  if (!import.meta.client) {
    return { teamId: undefined as ID | undefined, projectId: undefined as ID | undefined }
  }
  const teamRaw = localStorage.getItem(WORKSPACE_TEAM_KEY)
  const projectRaw = localStorage.getItem(WORKSPACE_PROJECT_KEY)
  return {
    teamId: teamRaw ? Number(teamRaw) : undefined,
    projectId: projectRaw ? Number(projectRaw) : undefined,
  }
}

export function writeWorkspaceIds(teamId?: ID, projectId?: ID) {
  if (!import.meta.client) return
  if (validID(teamId)) localStorage.setItem(WORKSPACE_TEAM_KEY, String(teamId))
  if (validID(projectId)) localStorage.setItem(WORKSPACE_PROJECT_KEY, String(projectId))
}

export function readPageByProject(): Record<string, ID> {
  if (!import.meta.client) return {}
  try {
    const raw = localStorage.getItem(WORKSPACE_PAGES_KEY)
    if (!raw) return {}
    const parsed = JSON.parse(raw) as Record<string, ID>
    return parsed && typeof parsed === 'object' ? parsed : {}
  } catch {
    return {}
  }
}

export function writePageForProject(projectId: ID, pageId: ID) {
  if (!import.meta.client || !validID(projectId) || !validID(pageId)) return
  const next = { ...readPageByProject(), [String(projectId)]: pageId }
  localStorage.setItem(WORKSPACE_PAGES_KEY, JSON.stringify(next))
}

export function canCreateProject(team?: ITeam | null) {
  return team?.role === TeamRole.OWNER
}
