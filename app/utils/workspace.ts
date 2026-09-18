import type { ReleaseFilterValue } from '#shared/utils/release'

export const WORKSPACE_TEAM_KEY = 'workspace:teamId'
export const WORKSPACE_PROJECT_KEY = 'workspace:projectId'
export const WORKSPACE_PAGES_KEY = 'workspace:pageByProject'
export const WORKSPACE_RELEASE_KEY = 'workspace:releaseByProject'
export const WORKSPACE_PROJECT_ORDER_KEY = 'workspace:projectOrder'

export function emptyProject(partial: Partial<IProject> = {}): IProject {
  return {
    id: 0,
    name: '',
    description: '',
    pages: [],
    users: [],
    isSteward: false,
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

/** Storage holds strings; anything unreadable falls back to All. */
function parseReleaseFilterValue(raw: unknown): ReleaseFilterValue {
  if (raw === 'unassigned') return 'unassigned'
  const value = Number(raw)
  return Number.isInteger(value) && value > 0 ? value : 'all'
}

export function readReleaseFilterByProject(): Record<string, ReleaseFilterValue> {
  if (!import.meta.client) return {}
  try {
    const raw = localStorage.getItem(WORKSPACE_RELEASE_KEY)
    if (!raw) return {}
    const parsed = JSON.parse(raw) as Record<string, unknown>
    if (!parsed || typeof parsed !== 'object') return {}
    const out: Record<string, ReleaseFilterValue> = {}
    for (const [projectId, value] of Object.entries(parsed)) {
      out[projectId] = parseReleaseFilterValue(value)
    }
    return out
  } catch {
    return {}
  }
}

export function readReleaseFilterForProject(projectId: ID): ReleaseFilterValue {
  return readReleaseFilterByProject()[String(projectId)] ?? 'all'
}

export function writeReleaseFilterForProject(
  projectId: ID,
  filter: ReleaseFilterValue
) {
  if (!import.meta.client || !validID(projectId)) return
  const next = { ...readReleaseFilterByProject(), [String(projectId)]: filter }
  localStorage.setItem(WORKSPACE_RELEASE_KEY, JSON.stringify(next))
}

/**
 * The card order per Team, layered by userId — unlike the keys above, which are
 * shared by whoever last used the browser. Shape:
 * `{ "<userId>": { "<teamId>": [projectId, ...] } }`.
 */
function readProjectOrderAll(): Record<string, Record<string, ID[]>> {
  if (!import.meta.client) return {}
  try {
    const raw = localStorage.getItem(WORKSPACE_PROJECT_ORDER_KEY)
    if (!raw) return {}
    const parsed = JSON.parse(raw) as Record<string, unknown>
    if (!parsed || typeof parsed !== 'object') return {}
    const out: Record<string, Record<string, ID[]>> = {}
    for (const [userId, teams] of Object.entries(parsed)) {
      if (!teams || typeof teams !== 'object') continue
      const byTeam: Record<string, ID[]> = {}
      for (const [teamId, ids] of Object.entries(
        teams as Record<string, unknown>
      )) {
        if (!Array.isArray(ids)) continue
        const kept = ids.filter((id) => validID(id as ID))
        if (kept.length) byTeam[teamId] = kept
      }
      out[userId] = byTeam
    }
    return out
  } catch {
    return {}
  }
}

/** Hand-edited or truncated storage degrades to "no custom order", not a throw. */
export function readProjectOrderByTeam(userId: ID): Record<string, ID[]> {
  if (!import.meta.client || !validID(userId)) return {}
  return readProjectOrderAll()[String(userId)] ?? {}
}

export function writeProjectOrderForTeam(
  userId: ID,
  teamId: ID,
  projectIds: ID[]
) {
  if (!import.meta.client || !validID(userId) || !validID(teamId)) return
  const all = readProjectOrderAll()
  const mine = { ...(all[String(userId)] ?? {}), [String(teamId)]: projectIds }
  localStorage.setItem(
    WORKSPACE_PROJECT_ORDER_KEY,
    JSON.stringify({ ...all, [String(userId)]: mine })
  )
}

export function canCreateProject(team?: ITeam | null) {
  return Boolean(team?.role)
}

export function canManageProjectSettings(project?: IProject | null) {
  return Boolean(project?.isSteward)
}

export function ownedProjectNames(projects: IProject[], userId: ID): string[] {
  return projects
    .filter((project) =>
      project.owners?.some((row) => String(row.userId) === String(userId))
    )
    .map((project) => project.name)
}

/**
 * Names of the Team's projects where `userId` is the *only* Project Owner.
 *
 * Leaving the Team deletes their ProjectOwner rows, and a project left with none
 * cannot be configured by anyone on the Team — so the page blocks the exit on
 * the same condition the server refuses it with
 * `projectsLeftWithoutOwner`. Who created a project is its Project Owner, so
 * this can be true of a plain MEMBER, not just a Team OWNER.
 */
export function soleOwnedProjectNames(projects: IProject[], userId: ID): string[] {
  return projects
    .filter((project) => {
      const owners = project.owners ?? []
      return (
        owners.length <= 1 &&
        owners.some((row) => String(row.userId) === String(userId))
      )
    })
    .map((project) => project.name)
}
