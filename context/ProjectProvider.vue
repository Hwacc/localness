<script lang="ts">
import type { IProject } from '~/types/interfaces'
import { Project } from '~/types/project'

export interface IProjectContext {
  projects: Ref<IProject[]>
  curProject: Ref<IProject>
}

const injectionKey = Symbol('ProjectContext')

export const injectProjectContext = () => {
  return inject<IProjectContext>(injectionKey, {} as IProjectContext)
}
export const provideProjectContext = (contextValue: IProjectContext) => {
  provide(injectionKey, contextValue)
  return contextValue
}
</script>

<script setup lang="ts">
// TODO: Mock project
const projects = ref<IProject[]>([])
const curProject = ref<IProject>(new Project())

const { data } = await useFetch('/api/project')
const { data: idData } = await useFetch('/api/project/1')
const { data: postData } = await useFetch('/api/project', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
  },
  body: JSON.stringify(curProject.value),
})
console.log('request', data.value)
console.log('request id', idData.value)
console.log('request post', postData.value)

provideProjectContext({
  projects,
  curProject,
})
</script>
<template>
  <slot />
</template>
