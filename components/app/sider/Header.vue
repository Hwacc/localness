<script setup lang="ts">
import type { DropdownMenuItem } from '@nuxt/ui'
import { ProjectExportModal, ProjectModal } from '#components'
import { injectEditorContext } from '~/providers/EditorProvider.vue'
import {
  injectTaskContext,
  type IFrontendTask,
} from '~/providers/TaskProvider.vue'
import { isEmpty, orderBy } from 'lodash-es'
import { TaskState } from '~/libs/task-queue/types'
import { Project } from '~/types/Project'

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
const projectExportModal = overlay.create(ProjectExportModal, {
  props: {},
})
const projectMenuItems = computed<DropdownMenuItem[]>(() => [
  {
    label: 'New Project',
    icon: 'i-lucide:folder-plus',
    onSelect: () => {
      projectModal.patch({
        mode: 'create',
        project: new Project(''),
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
    label: 'Export Project',
    icon: 'i-tabler:package-export',
    onSelect: () => {
      // TODO: make a step modal to export
      projectExportModal.open()

      // const queue = exporter.exportProject()
      // queue?.addEventListener('start', (e: any) => {
      //   console.log('export start', e.detail.info.name)
      // })
      // queue?.addEventListener('success', (e: any) => {
      //   console.log('export success', e.detail.info.name)
      // })
      // queue?.addEventListener('end', (e: any) => {
      //   console.log('export end', e.detail)
      // })
      // queue?.start()
    },
  },
  {
    label: 'Project Settings',
    icon: 'i-lucide:settings',
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
])

const enterTaskIndex = ref<number | null>(null)
const clearTag = ref<number>(new Date().getTime())
const sortedTaskList = computed<IFrontendTask[]>(() => {
  if (isEmpty(taskList)) return []
  if (clearTag.value)
    return orderBy(
      taskList.filter((t) => t.createAt! > clearTag.value),
      ['state', 'createAt'],
      ['desc']
    )
  return orderBy(taskList, ['state', 'createAt'], ['desc'])
})

function getTaskStateIcon(state: TaskState) {
  switch (state) {
    case TaskState.Pending:
      return { icon: 'i-svg-spinners:3-dots-scale', color: 'text-gray-500' }
    case TaskState.Running:
      return { icon: 'i-svg-spinners:6-dots-rotate', color: 'text-primary' }
    case TaskState.Success:
      return { icon: 'i-lucide:circle-check-big', color: 'text-green-500' }
    case TaskState.Error:
      return { icon: 'i-lucide:circle-x', color: 'text-red-500' }
    case TaskState.Timeout:
      return { icon: 'i-mdi:clock-alert-outline', color: 'text-yellow-500' }
    default:
      return { icon: 'i-ri:question-line', color: 'text-gray-500' }
  }
}

onUnmounted(() => {
  console.log('onUnmounted')
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
        <div
          class="flex items-center justify-between p-2.5 border-b-1 border-gray-200"
        >
          <p class="text-base font-bold">Task List</p>
          <div class="flex gap-2">
            <UButton variant="ghost" size="xs">History</UButton>
            <UButton
              variant="ghost"
              size="xs"
              @click="clearTag = new Date().getTime()"
            >
              Clear
            </UButton>
          </div>
        </div>
        <ul class="w-72 max-h-64 flex flex-col overflow-auto pb-2.5">
          <li
            v-for="(task, index) in sortedTaskList"
            :key="task.id"
            class="flex items-center gap-2.5 p-2.5 border-b-1 border-gray-200 last:border-b-0 hover:bg-gray-100"
            @mouseenter="enterTaskIndex = index"
            @mouseleave="enterTaskIndex = null"
          >
            <UIcon
              v-if="task.type === 'queue'"
              :size="20"
              name="i-mdi:book-multiple-outline"
            ></UIcon>
            <UIcon v-else :size="20" name="i-mdi:book-outline"></UIcon>
            <div class="flex flex-col gap-0.5 grow">
              <p class="font-bold text-sm">
                {{
                  task.name ||
                  (task.type === 'queue'
                    ? `Queue ${index + 1}`
                    : `Task ${index + 1}`)
                }}
              </p>
              <p class="text-xs color-secondary line-clamp-1">
                {{ task.description }}
              </p>
              <p class="text-xs color-secondary line-clamp-1">
                {{ $dayjs(task.createAt).format('YYYY-MM-DD HH:mm:ss') }}
              </p>
            </div>
            <!-- TODO: task retry -->
            <UIcon
              v-if="
                enterTaskIndex === index &&
                (task.state === TaskState.Timeout ||
                  task.state === TaskState.Error)
              "
              :size="20"
              name="i-ic:round-refresh"
              class="text-gray-500 hover:text-black"
            ></UIcon>
            <UIcon
              v-else
              :size="20"
              :name="getTaskStateIcon(task.state).icon"
              :class="$cn(getTaskStateIcon(task.state).color)"
            ></UIcon>
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
          <UIcon :size="20" name="i-lucide:ellipsis-vertical"></UIcon>
        </div>
      </template>
    </UDropdownMenu>
  </div>
</template>
