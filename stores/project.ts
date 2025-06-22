import { merge } from 'lodash-es'
import type { ID } from '~/types/global'
import type { IProject } from '~/types/interfaces'
import { Project } from '~/types/project'

export const useProjectStore = defineStore('project', () => {
  const toast = useToast()
  const projects = ref<IProject[]>([])
  const curProject = ref<IProject>(new Project())


  const pageList = computed(() => {
    return curProject.value.pages ?? []
  })

  async function getProjects() {
    const projs = await useApi<IProject[]>('/api/project')
    console.log('projs', projs)
    projects.value = projs ?? []

    if (projs.length > 0 && !curProject.value.id) {
      curProject.value = projects.value[0]
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
    if (import.meta.client) {
      toast.add({
        title: 'Success',
        description: 'Project created successfully',
        color: 'success',
        icon: 'i-lucide:circle-check',
        actions: [
          {
            label: 'Open Project',
            icon: 'i-lucide:folder-open',
            color: 'success',
            variant: 'solid',
            onClick: () => {
              curProject.value = newProject!
            },
          },
        ],
      })
    }
    return newProject
  }

  async function updateProject(
    pid: ID,
    project: Omit<IProject, 'id' | 'pages' | 'users'>
  ) {
    const id = await useApi<ID>(`/api/project/${pid}`, {
      method: 'POST',
      body: project,
    })
    if (id) {
      curProject.value = merge(curProject.value, project)
      projects.value = projects.value.map((p) =>
        p.id === pid ? merge(p, project) : p
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
