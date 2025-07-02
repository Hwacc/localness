<script lang="ts">
import type { ITask, QueueResult, TaskState } from '~/libs/task-queue/types'
import TaskQueue from '~/libs/task-queue'
import { pick } from 'lodash-es'

export interface IFrontendTask {
  id: string
  state: TaskState
  name?: string
  description?: string
  action?: 'download' | 'translate'
  type?: 'task' | 'queue'
  error?: Error
  result?: any[] | any
}

export interface ITaskContext {
  taskList: IFrontendTask[]
  push: (...tasks: ITask[]) => void
  pop: () => IFrontendTask | undefined
  unshift: (...tasks: ITask[]) => void
  shift: () => IFrontendTask | undefined
  patch: (...queues: TaskQueue[]) => void
  find: (taskID: string) => void
  remove: (taskID: string) => void
}

const injectionKey: InjectionKey<ITaskContext> = Symbol('TaskContext')

export function injectTaskContext() {
  return inject<ITaskContext>(injectionKey, {
    taskList: [],
    push: () => {},
    pop: () => undefined,
    unshift: () => {},
    shift: () => undefined,
    patch: () => {},
    find: () => {},
    remove: () => {},
  })
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

const taskList = reactive<IFrontendTask[]>([])
function mergeResult(result: QueueResult) {
  const foundTask = taskList.find((t) => t.id === result.id)
  if (foundTask) {
    Object.assign(foundTask, result)
  }
}

backendTaskQueue.addEventListener('start', (evt: any) => {
  console.log('context queue start', evt.detail)
  mergeResult(evt.detail)
})
backendTaskQueue.addEventListener('error', (evt: any) => {
  console.error('context queue error', evt.detail)
  mergeResult(evt.detail)
})
backendTaskQueue.addEventListener('success', (evt: any) => {
  console.log('context queue success', evt.detail)
  mergeResult(evt.detail)
})
backendTaskQueue.addEventListener('timeout', (evt: any) => {
  console.log('context queue timeout', evt.detail)
  mergeResult(evt.detail)
})
backendTaskQueue.addEventListener('end', (evt: any) => {
  console.log('context queue end', evt.detail)
})

const pickup = [
  'id',
  'name',
  'state',
  'description',
  'type',
  'error',
  'result',
  'action',
]

const push = (...tasks: ITask[]) => {
  taskList.push(
    ...tasks.map((task) => {
      const picked = pick(task.options, pickup) as IFrontendTask
      console.log('push', picked)
      return picked
    })
  )
  backendTaskQueue.push(...tasks)
}

const pop = () => {
  const popped = taskList.pop()
  backendTaskQueue.remove(popped?.id)
  return popped
}

const unshift = (...tasks: ITask[]) => {
  taskList.unshift(
    ...tasks.map((task) => pick(task.options, pickup) as IFrontendTask)
  )
  backendTaskQueue.unshift(...tasks)
}

const shift = () => {
  const shifted = taskList.shift()
  backendTaskQueue.remove(shifted?.id)
  return shifted
}

const patch = (...queues: TaskQueue[]) => {
  taskList.push(...queues.map((q) => pick(q.options, pickup) as IFrontendTask))
  backendTaskQueue.patch(...queues)
}

const find = (taskID: string) => {
  return taskList.find((t) => t.id === taskID)
}

const remove = (taskID: string) => {
  const foundIndex = taskList.findIndex((t) => t.id === taskID)
  if (foundIndex !== -1) taskList.splice(foundIndex, 1)
  backendTaskQueue.remove(taskID)
}

provideTaskContext({
  taskList,
  push,
  pop,
  unshift,
  shift,
  patch,
  find,
  remove,
})
</script>

<template>
  <slot />
</template>
