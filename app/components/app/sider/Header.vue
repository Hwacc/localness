<script setup lang="ts">
import {
  injectTaskContext,
  type IFrontendTask,
} from '~/providers/TaskProvider.vue'
import { isEmpty, orderBy } from 'lodash-es'
import { TaskState } from '~/libs/task-queue/types'

const { taskList } = injectTaskContext()

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
      return { icon: 'i-svg-spinners:3-dots-scale', color: 'text-muted' }
    case TaskState.Running:
      return { icon: 'i-svg-spinners:6-dots-rotate', color: 'text-primary' }
    case TaskState.Success:
      return { icon: 'i-lucide:circle-check-big', color: 'text-green-500' }
    case TaskState.Error:
      return { icon: 'i-lucide:circle-x', color: 'text-red-500' }
    case TaskState.Timeout:
      return { icon: 'i-mdi:clock-alert-outline', color: 'text-yellow-500' }
    default: {
      const _exhaustive: never = state
      return { icon: 'i-ri:question-line', color: 'text-muted' }
    }
  }
}
</script>

<template>
  <div class="flex items-center justify-between py-4 px-2 gap-2 shadow">
    <div class="flex-1 text-base font-bold overflow-hidden">Pages</div>
    <UPopover
      v-if="sortedTaskList.length > 0"
      :content="{ side: 'bottom', align: 'start' }"
    >
      <div
        :class="
          $cn(
            'px-1 h-full flex items-center justify-center cursor-pointer text-muted hover:text-highlighted'
          )
        "
      >
        <UIcon :size="20" name="i-lucide:list-todo"> </UIcon>
      </div>
      <template #content>
        <div
          class="flex items-center justify-between p-2.5 border-b-1 border-default"
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
            class="flex items-center gap-2.5 p-2.5 border-b-1 border-default last:border-b-0 hover:bg-elevated"
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
              class="text-muted hover:text-highlighted"
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
  </div>
</template>
