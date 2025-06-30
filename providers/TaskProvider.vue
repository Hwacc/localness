<script lang="ts">
import Queue from 'queue'
import { reactive } from 'vue'

export interface ITaskContext {
  taskQueue: Queue
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
provideTaskContext({ taskQueue })
</script>

<template>
  <slot />
</template>
