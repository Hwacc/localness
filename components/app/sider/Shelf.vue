<script setup lang="ts">
import type { IProject } from '~/types/interfaces'

const { $dayjs } = useNuxtApp()

const store = useProjectStore()
const { setCurrentProject } = store

const open = ref(false)

function onSelectProject(p: IProject) {
  setCurrentProject(p)
  open.value = false
}

defineExpose({
  open: () => (open.value = true),
  close: () => (open.value = false),
})
</script>

<template>
  <div
    :class="[
      'absolute inset-0 flex flex-col bg-gray-50 shadow transition-transform',
      open ? 'translate-x-0' : 'translate-x-[-100%]',
    ]"
  >
    <div class="flex items-center py-4 px-2 gap-4 shadow">
      <UIcon class="size-6" name="i-lucide:arrow-left" @click="open = false" />
      <p class="text-base font-bold">Select Project</p>
    </div>
    <div class="flex-1 flex flex-col gap-2 p-2 overflow-hidden">
      <!-- TODO: Search -->
      <UInput placeholder="Search" />
      <ul class="h-full flex-1 overflow-y-auto overflow-x-hidden">
        <li
          v-for="project in store.projects"
          :key="project.id"
          class="flex flex-col gap-1 p-2 cursor-pointer hover:bg-gray-100 hover:text-green-600"
          @click="onSelectProject(project)"
        >
          <p class="font-bold">
            {{ project.name }}
          </p>
          <p class="text-xs color-secondary">
            Last Updated:
            {{ $dayjs(project.updatedAt).format('YYYY-MM-DD HH:mm:ss') }}
          </p>
        </li>
      </ul>
    </div>
  </div>
</template>
