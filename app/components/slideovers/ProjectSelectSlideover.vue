<script setup lang="ts">
import { injectEditorContext } from '~/providers/EditorProvider.vue'
import { isEmpty } from 'lodash-es'

const { $dayjs } = useNuxtApp()

const { modelValue } = defineProps<{ modelValue: boolean }>()
const emit = defineEmits<{ 'update:modelValue': [boolean] }>()

const projectStore = useProjectStore()
const { setCurrentProject } = projectStore

const { editor, autoSave } = injectEditorContext()

const search = ref('')
const filteredProjects = computed(() => {
  return projectStore.projects.filter((p) => {
    return p.name.toLowerCase().includes(search.value.toLowerCase())
  })
})

async function onSelectProject(p: IProject) {
  if (p.id === projectStore.curProject?.id) {
    emit('update:modelValue', false)
    return
  }
  console.log('onSelectProject', autoSave, editor.value)
  await autoSave.ask()
  editor.value?.clear()
  setCurrentProject(p)
  emit('update:modelValue', false)
}
</script>

<template>
  <USlideover
    class="max-w-[21.875rem]"
    title="Select Project"
    side="left"
    :close="{
      icon: 'i-lucide:x',
    }"
    :open="modelValue"
    :ui="{ body: 'p-4 sm:p-4', header: 'p-4 sm:p-4' }"
    @update:open="
      (isOpen) => {
        emit('update:modelValue', isOpen)
      }
    "
  >
    <template #body>
      <div class="size-full flex flex-col gap-3 overflow-hidden">
        <div class="flex items-center gap-2">
          <UInput v-model="search" class="flex-1" placeholder="Search" />
          <UButton
            icon="i-lucide:search"
            size="md"
            color="primary"
            variant="solid"
          />
        </div>
        <div
          v-if="isEmpty(filteredProjects)"
          class="flex-1 flex flex-col gap-4 items-center justify-center"
        >
          <UIcon name="i-mingcute:empty-box-line" size="40" />
          <p class="text-gray-500">No projects found</p>
        </div>
        <ul v-else class="h-full flex-1 overflow-y-auto overflow-x-hidden">
          <li
            v-for="project in filteredProjects"
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
    </template>
  </USlideover>
</template>
