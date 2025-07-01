<script lang="ts">
import type { Task } from '~/libs/task-queue'
import TaskQueue from '~/libs/task-queue'

export interface ITaskContext {
  taskQueue: TaskQueue
  push: (...tasks: Task[]) => void
  pop: () => TaskQueue | Task | undefined
  unshift: (...tasks: Task[]) => void
  shift: () => TaskQueue | Task | undefined
  patch: (queue: TaskQueue) => void
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
  new TaskQueue({
    concurrency: 1,
    timeout: 10000,
    autostart: true,
  })
)

taskQueue.addEventListener('start', (evt: any) => {
  console.log('context queue start', evt.detail)
})
taskQueue.addEventListener('error', (evt: any) => {
  console.error('context queue error', evt.detail)
})
taskQueue.addEventListener('success', (evt: any) => {
  console.log('context queue success', evt.detail)
})
taskQueue.addEventListener('timeout', (evt: any) => {
  console.log('context queue timeout', evt.detail)
})
taskQueue.addEventListener('end', (evt: any) => {
  console.log('context queue end', evt.detail)
})

const push = (...tasks: Task[]) => {
  taskQueue.push(...tasks)
}

const pop = () => {
  return taskQueue.pop()
}

const unshift = (...tasks: Task[]) => {
  taskQueue.unshift(...tasks)
}

const shift = () => {
  return taskQueue.shift()
}

const patch = (queue: TaskQueue) => {
  taskQueue.patch(queue)
}

provideTaskContext({ taskQueue, push, pop, unshift, shift, patch })
</script>

<template>
  <slot />
</template>
