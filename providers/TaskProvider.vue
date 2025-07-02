<script lang="ts">
import type { ITask } from '~/libs/task-queue/types'
import TaskQueue from '~/libs/task-queue'

export interface IDisplayTask {
  id: string
  type: ''
  name: string
  description: string
}

export interface ITaskContext {
  list: IDisplayTask[]
  push: (...tasks: ITask[]) => void
  pop: () => TaskQueue | ITask | undefined
  unshift: (...tasks: ITask[]) => void
  shift: () => TaskQueue | ITask | undefined
  patch: (...queues: TaskQueue[]) => void
  find: () => void
  remove: () => void
}

const injectionKey: InjectionKey<ITaskContext> = Symbol('TaskContext')

export function injectTaskContext() {
  return inject<ITaskContext>(injectionKey)
}

export function provideTaskContext(contextValue: ITaskContext) {
  provide(injectionKey, contextValue)
  return contextValue
}
</script>

<script setup lang="ts">
const backendTaskQueue = new TaskQueue({
  concurrency: 1,
  timeout: 10000,
  autostart: true,
})

backendTaskQueue.addEventListener('start', (evt: any) => {
  console.log('context queue start', evt.detail)
})
backendTaskQueue.addEventListener('error', (evt: any) => {
  console.error('context queue error', evt.detail)
})
backendTaskQueue.addEventListener('success', (evt: any) => {
  console.log('context queue success', evt.detail)
})
backendTaskQueue.addEventListener('timeout', (evt: any) => {
  console.log('context queue timeout', evt.detail)
})
backendTaskQueue.addEventListener('end', (evt: any) => {
  console.log('context queue end', evt.detail)
})

const push = (...tasks: ITask[]) => {
  backendTaskQueue.push(...tasks)
}

const pop = () => {
  return backendTaskQueue.pop()
}

const unshift = (...tasks: ITask[]) => {
  backendTaskQueue.unshift(...tasks)
}

const shift = () => {
  return backendTaskQueue.shift()
}

const patch = (...queues: TaskQueue[]) => {
  backendTaskQueue.patch(...queues)
}

const find = () => {
  return
}

const remove = () => {
  return
}

provideTaskContext({ push, pop, unshift, shift, patch, find, remove })
</script>

<template>
  <slot />
</template>
