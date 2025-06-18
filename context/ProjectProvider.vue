<script lang="ts">
import type { IProject } from '~/types/interfaces'
import { Project } from '~/types/project'

export interface IProjectContext {
  projects: Ref<IProject[]>
  curProject: Ref<IProject>
  createProject: (project: Partial<IProject>) => Promise<void>
}

const injectionKey: InjectionKey<IProjectContext> = Symbol('ProjectContext')
export function injectProjectContext() {
  return inject(injectionKey, {
    projects: ref([]),
    curProject: ref({} as IProject),
    createProject: () => Promise.reject(new Error('Not implemented')),
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
    projects.value.push(data.value)
    curProject.value = data.value
  }
}

provideProjectContext({
  projects,
  curProject,
  createProject,
})
</script>
<template>
  <slot />
</template>
