<script lang="ts">
import type { Task } from '~/types/Task'
import Queue from 'queue'
import { reactive } from 'vue'
import type { ITaskJob } from '~/types/interfaces'

export interface ITaskContext {
  taskQueue: Queue
  push: (task: Task) => void
  pop: () => Task | undefined
  unshift: (task: Task) => void
  shift: () => void
  find: (task: Task | string) => Task
  remove: (task: Task | string) => Task
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
const taskQueue = reactive(
  new Queue({
    concurrency: 1,
    timeout: 10000,
    autostart: true,
  })
)

const push = (...tasks: Task[]) => {
  taskQueue.push(...tasks.map((task) => task.job))
}

const pop = () => {
  const job = taskQueue.pop()
  if (!job) return
  return (job as ITaskJob).task
}

const unshift = (tasks: Task[]) => {
  taskQueue.unshift(...tasks.map((task) => task.job))
}

const shift = () => {
  const job = taskQueue.shift()
  if (!job) return
  return (job as ITaskJob).task
}

const find = (task: Task | string) => {
  if (typeof task === 'string') {
    const findIndex = taskQueue.jobs
  }
}

provideTaskContext({ taskQueue, push, pop, unshift, shift })
</script>

<template>
  <slot />
</template>
