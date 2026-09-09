import { isEmpty, merge } from 'lodash-es'

export const useProjectStore = defineStore('project', () => {
  const toast = useToast()
  const projects = ref<IProject[]>([])
  const teams = ref<ITeam[]>([])
  const curProject = ref<IProject>(emptyProject())
  const curTeamId = ref<ID | undefined>()
  const pageStore = usePageStore()

  const pageList = computed(() => curProject.value.pages ?? [])

  const curTeam = computed(
    () => teams.value.find((t) => String(t.id) === String(curTeamId.value)) ?? null
  )

  const projectsByTeam = computed(() =>
    teams.value.map((team) => ({
      team,
      projects: projects.value.filter(
        (p) => String(p.teamId) === String(team.id)
      ),
    }))
  )

  async function getTeams() {
    teams.value = (await useApi<ITeam[]>('/api/teams')) ?? []
    return teams.value
  }

  function persistWorkspace() {
    writeWorkspaceIds(curTeamId.value, curProject.value.id)
  }

  function applyPageForProject(project: IProject) {
    const pages = project.pages ?? []
    if (isEmpty(pages)) {
      pageStore.setCurrentPage(emptyPage())
      return
    }
    const remembered = readPageByProject()[String(project.id)]
    const match = pages.find((p) => String(p.id) === String(remembered))
    pageStore.setCurrentPage(match ?? pages[0]!)
  }

  function setCurrentProject(proj: IProject | ID) {
    if (typeof proj === 'object' && proj) {
      curProject.value = proj
    } else {
      curProject.value =
        projects.value.find((p) => String(p.id) === String(proj)) ??
        emptyProject()
    }
    if (validID(curProject.value.teamId)) {
      curTeamId.value = curProject.value.teamId
    }
    persistWorkspace()
    applyPageForProject(curProject.value)
  }

  function setCurrentTeam(teamId: ID | undefined) {
    curTeamId.value = teamId
    persistWorkspace()
    if (!validID(teamId)) return
    if (String(curProject.value.teamId) === String(teamId)) return
    const inTeam = projects.value.filter(
      (p) => String(p.teamId) === String(teamId)
    )
    if (inTeam[0]) setCurrentProject(inTeam[0])
  }

  function restoreWorkspace() {
    const stored = readWorkspaceIds()
    if (validID(stored.projectId)) {
      const found = projects.value.find(
        (p) => String(p.id) === String(stored.projectId)
      )
      if (found) {
        setCurrentProject(found)
        return
      }
    }
    if (validID(stored.teamId)) {
      const teamExists = teams.value.some(
        (t) => String(t.id) === String(stored.teamId)
      )
      if (teamExists) {
        setCurrentTeam(stored.teamId)
        return
      }
    }
    if (projects.value[0]) {
      setCurrentProject(projects.value[0])
      return
    }
    if (teams.value[0]) {
      curTeamId.value = teams.value[0].id
      persistWorkspace()
    }
  }

  async function getProjects() {
    try {
      const [projs] = await Promise.all([
        useApi<IProject[]>('/api/project'),
        getTeams(),
      ])
      projects.value = projs ?? []
    } catch (error) {
      console.error('getProjects failed', error)
      return projects.value
    }
    if (validID(curProject.value.id)) {
      const fresh = projects.value.find(
        (p) => String(p.id) === String(curProject.value.id)
      )
      if (fresh) {
        curProject.value = fresh
        if (validID(fresh.teamId)) curTeamId.value = fresh.teamId
        persistWorkspace()
        const pageStillThere = (fresh.pages ?? []).some(
          (p) => String(p.id) === String(pageStore.curPage.id)
        )
        if (!pageStillThere) applyPageForProject(fresh)
        return projects.value
      }
    }
    restoreWorkspace()
    return projects.value
  }

  async function createProject(
    project: Omit<IProject, 'id' | 'pages' | 'users'>
  ) {
    const newProject = await useApi<IProject>('/api/project', {
      method: 'POST',
      body: project,
    })
    if (!newProject) return null
    projects.value.unshift(newProject)
    return newProject
  }

  async function updateProject(
    pid: ID,
    project: Omit<IProject, 'id' | 'pages' | 'users'>
  ) {
    if (!validID(pid)) return
    const updatedProject = await useApi<{
      id: ID
      name: string
      description: string
      updatedAt: Date
    }>(`/api/project/${pid}`, {
      method: 'POST',
      body: project,
    })
    if (updatedProject) {
      if (updatedProject.id === curProject.value.id) {
        curProject.value = merge(curProject.value, updatedProject)
      }
      projects.value = projects.value.map((p) =>
        p.id === updatedProject.id ? merge(p, updatedProject) : p
      )
      toast.add({
        title: 'Success',
        description: 'Project updated successfully',
        color: 'success',
        icon: 'i-lucide:circle-check',
      })
      return true
    }
    return false
  }

  return {
    projects,
    teams,
    curProject,
    curTeamId,
    curTeam,
    pageList,
    projectsByTeam,
    getProjects,
    getTeams,
    createProject,
    updateProject,
    setCurrentProject,
    setCurrentTeam,
  }
})

export type ProjectStore = ReturnType<typeof useProjectStore>
