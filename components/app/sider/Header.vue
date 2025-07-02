<script setup lang="ts">
import type { DropdownMenuItem } from '@nuxt/ui'
import { ProjectModal } from '#components'
import { injectEditorContext } from '~/providers/EditorProvider.vue'
import {
  injectTaskContext,
  type IFrontendTask,
} from '~/providers/TaskProvider.vue'
import { isEmpty, orderBy } from 'lodash-es'

const projectStore = useProjectStore()
const { createProject, updateProject, setCurrentProject } = projectStore

const { editor, autoSave } = injectEditorContext()
const { taskList } = injectTaskContext()

const toast = useToast()
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
          const newProject = await createProject(p)
          if (!newProject) return
          toast.add({
            title: 'Success',
            description: 'Project created successfully',
            color: 'success',
            icon: 'i-lucide:circle-check',
            actions: [
              {
                label: 'Open Project',
                icon: 'i-lucide:folder-open',
                color: 'success',
                variant: 'solid',
                onClick: async () => {
                  await autoSave.ask()
                  editor.value?.clear()
                  setCurrentProject(newProject)
                },
              },
            ],
          })
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
      emit('openProjectShelf')
    },
  },
  {
    label: 'Edit Project',
    icon: 'i-lucide:folder-pen',
    onSelect: () => {
      projectModal.patch({
        mode: 'edit',
        project: projectStore.curProject,
        onSave: async (p, { close }) => {
          await updateProject(projectStore.curProject.id, p)
          close()
        },
      })
      projectModal.open()
    },
  },
]

const sortedTaskList = computed<IFrontendTask[]>(() => {
  if (isEmpty(taskList)) return []
  return orderBy(taskList, ['state', 'createAt'], ['desc'])
})
</script>

<template>
  <div class="flex items-center justify-between py-4 px-2 gap-2 shadow">
    <div class="flex-1 text-base font-bold overflow-hidden">
      {{ projectStore.curProject.name }}
    </div>
    <UPopover
      v-if="sortedTaskList.length > 0"
      :content="{ side: 'bottom', align: 'start' }"
    >
      <div
        :class="
          $cn(
            'px-1 h-full flex items-center justify-center cursor-pointer text-gray-500 hover:text-black'
          )
        "
      >
        <UIcon :size="20" name="i-lucide:list-todo"> </UIcon>
      </div>
      <template #content>
        <ul class="w-64 max-h-64 overflow-auto p-2.5">
          <li v-for="task in sortedTaskList" :key="task.id" class="">
            <p>{{ task.id }}</p>
            <p>{{ task.state }}</p>
          </li>
        </ul>
      </template>
    </UPopover>
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
        <div
          :class="
            $cn(
              'px-1 h-full flex items-center justify-center cursor-pointer text-gray-500 hover:text-black',
              open && 'text-black'
            )
          "
        >
          <UIcon :size="20" name="i-lucide:ellipsis-vertical"> </UIcon>
        </div>
      </template>
    </UDropdownMenu>
  </div>
</template>
