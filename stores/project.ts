import { isEmpty, merge } from 'lodash-es'
import type { ID } from '~/types/global'
import type { IProject } from '~/types/Project'
import { Page } from '~/types/Page'
import { Project } from '~/types/Project'

export const useProjectStore = defineStore('project', () => {
  const toast = useToast()
  const projects = ref<IProject[]>([])
  const curProject = ref<IProject>(new Project())
  const pageStore = usePageStore()

  const pageList = computed(() => {
    return curProject.value.pages ?? []
  })

  async function getProjects() {
    const projs = await useApi<IProject[]>('/api/project')
    console.log('projs', projs)
    projects.value = projs ?? []
    if (projs.length > 0 && !curProject.value.id) {
      setCurrentProject(projects.value[0])
    }
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
    if(!validID(pid)) return
    const updatedProject = await useApi<{
      id: ID
      name: string
      description: string
      updatedAt: Date
    }>(`/api/project/${pid}`, {
      method: 'POST',
      body: project,
    })
    console.log('updatedProject', updatedProject)
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

  function setCurrentProject(proj: IProject | ID) {
    if (proj instanceof Project || typeof proj === 'object') {
      curProject.value = proj
    } else {
      curProject.value =
        projects.value.find((p) => p.id === (proj as ID)) ?? new Project()
    }
    if (!isEmpty(curProject.value.pages)) {
      pageStore.setCurrentPage(curProject.value.pages[0])
    } else {
      pageStore.setCurrentPage(new Page())
    }
  }

  return {
    projects,
    curProject,
    pageList,
    getProjects,
    createProject,
    updateProject,
    setCurrentProject,
  }
})

export type ProjectStore = ReturnType<typeof useProjectStore>
