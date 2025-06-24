<script setup lang="ts">
import type { DropdownMenuItem } from '@nuxt/ui'
import { ProjectModal } from '#components'

const store = useProjectStore()
const { createProject, updateProject } = store

const overlay = useOverlay()

const emit = defineEmits<{ openProjectShelf: [] }>()

const projectModal = overlay.create(ProjectModal, {
  props: {
    mode: 'create',
    onSave: () => {},
  },
})
const projectMenuItems: DropdownMenuItem[] = [
  {
    label: 'New Project',
    icon: 'i-lucide:folder-plus',
    onSelect: () => {
      projectModal.patch({
        mode: 'create',
        onSave: async (p, { close }) => {
          await createProject(p)
          close()
        },
      })
      projectModal.open()
    },
  },
  {
    label: 'Open Project',
    icon: 'i-lucide:folder-open',
    onSelect: () => {
      //TODO: emit open project sheet
      emit('openProjectShelf')
    },
  },
  {
    label: 'Edit Project',
    icon: 'i-lucide:folder-pen',
    onSelect: () => {
      projectModal.patch({
        mode: 'edit',
        project: store.curProject,
        onSave: async (p, { close }) => {
          await updateProject(store.curProject.id, p)
          close()
        },
      })
      projectModal.open()
    },
  },
]
</script>

<template>
  <div class="flex items-center justify-between py-4 px-2 gap-2 shadow">
    <div class="flex-1 text-base font-bold overflow-hidden">
      {{ store.curProject.name }}
    </div>
    <UDropdownMenu
      :items="projectMenuItems"
      :content="{
        align: 'start',
        side: 'bottom',
      }"
      :ui="{
        content: 'w-48',
      }"
    >
      <template #default="{ open }">
        <UButton
          :class="['hover:text-green-400', open && 'text-green-400']"
          icon="i-lucide-menu"
          color="neutral"
          variant="outline"
        />
      </template>
    </UDropdownMenu>
  </div>
</template>
