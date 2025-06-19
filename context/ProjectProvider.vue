<script lang="ts">
import type { ID } from '~/types/global'
import type { IProject } from '~/types/interfaces'
import { Project } from '~/types/project'
import { merge } from 'lodash-es'

export interface IProjectContext {
  projects: Ref<IProject[]>
  curProject: Ref<IProject>
  createProject: (
    project: Omit<IProject, 'id' | 'pages'>
  ) => Promise<IProject | null>
  updateProject: (project: Omit<IProject, 'pages'>) => Promise<ID | null>
}

const injectionKey: InjectionKey<IProjectContext> = Symbol('ProjectContext')
export function injectProjectContext() {
  return inject(injectionKey, {
    projects: ref([]),
    curProject: ref({} as IProject),
    createProject: () => Promise.reject(new Error('Not implemented')),
    updateProject: () => Promise.reject(new Error('Not implemented')),
  })
}
export function provideProjectContext(contextValue: IProjectContext) {
  provide(injectionKey, contextValue)
  return contextValue
}
</script>

<script setup lang="ts">
const projects = ref<IProject[]>([])
const curProject = ref<IProject>(new Project())
const toast = useToast()

// 使用包装后的 useApi
const { data } = await useApi<IProject[]>('/api/project')
if (data.value) {
  projects.value = data.value
  console.log('projects.value', projects.value)
  if (data.value.length > 0) curProject.value = data.value[0]
}

async function createProject(project: Partial<IProject>) {
  const { data } = await useApi<IProject>('/api/project', {
    method: 'POST',
    body: project,
  })
  if (data.value) {
    projects.value.unshift(data.value)
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
            curProject.value = data.value!
          },
        },
      ],
    })
  }
  return data.value
}

async function updateProject(project: Omit<IProject, 'pages'>) {
  const { data } = await useApi<ID>(`/api/project/${project.id}`, {
    method: 'POST',
    body: project,
  })
  if (data.value) {
    projects.value = projects.value.map((p) =>
      p.id === project.id ? merge(p, project) : p
    )
    toast.add({
      title: 'Success',
      description: 'Project updated successfully',
      color: 'success',
      icon: 'i-lucide:circle-check',
    })
  }
  return data.value
}

provideProjectContext({
  projects,
  curProject,
  createProject,
  updateProject,
})
</script>

<template>
  <slot />
</template>
