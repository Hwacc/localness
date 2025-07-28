<script setup lang="ts">
import type { CheckboxGroupItem } from '@nuxt/ui'
import { compact } from 'lodash-es'
import {
  today,
  getLocalTimeZone,
  type DateValue,
} from '@internationalized/date'
import { TaskState } from '~/libs/task-queue/types'

const { $dayjs } = useNuxtApp()
const projectStore = useProjectStore()

const state = reactive({
  selectedPages:
    projectStore.curProject?.pages?.map((page) => page.id + '') || [],
  i18nKey: true,
  dateRange: {
    start: undefined,
    end: undefined,
  },
  fileFormat: ['xlsx'],
})

const curStep = ref(0)
const stepper = useTemplateRef<any>('stepper')
const exporter = useProjectExport()

const emit = defineEmits<{
  close: [boolean]
}>()

const steps = [
  {
    title: 'Select Page',
    icon: 'i-material-symbols:imagesmode-outline',
    slot: 'step1',
  },
  {
    title: 'Tags Filter',
    icon: 'i-lucide:filter',
    slot: 'step2',
  },
  {
    title: 'Select Export File',
    icon: 'i-lucide:file-output',
    slot: 'step3',
  },
  {
    title: 'Export',
    icon: 'i-lucide:hard-drive-download',
    slot: 'step4',
  },
]

const selectAllPages = computed({
  get: () => {
    if (pageItems.value.length === state.selectedPages.length) {
      return true
    } else if (state.selectedPages.length > 0) {
      return 'indeterminate'
    }
    return false
  },
  set: (value) => {
    if (value) {
      state.selectedPages = compact(
        pageItems.value.map(
          // @ts-expect-error item.value is string
          (item) => item?.value || ''
        )
      )
    } else {
      state.selectedPages = []
    }
  },
})
const pageItems = computed<CheckboxGroupItem[]>(() => {
  if (projectStore.curProject?.pages) {
    return projectStore.curProject.pages.map((page) => ({
      id: page.id + '',
      label: page.name,
      value: page.id + '',
      description: `Updated at ${$dayjs(page.updatedAt).format(
        'YYYY-MM-DD HH:mm:ss'
      )}`,
      ui: {
        label: 'text-base font-bold',
        description: 'text-xs',
      },
    }))
  }
  return []
})

const fileItems = [
  {
    label: 'XLSX',
    value: 'xlsx',
    icon: 'i-vscode-icons:file-type-excel',
  },
  {
    label: 'JSON',
    value: 'json',
    icon: 'i-vscode-icons:file-type-json',
  },
]

function onFileFormatClick(val: string) {
  if (val === 'json') {
    // TODO: not supported export json yet
    return
  }
  const index = state.fileFormat.findIndex((f) => f === val)
  if (index > -1) {
    state.fileFormat.splice(index, 1)
  } else {
    state.fileFormat.push(val)
  }
}

const exportTasks = ref<
  Array<{
    id: string
    name?: string
    description?: string
    state: TaskState
  }>
>([])

const exportState = ref<'idle' | 'exporting' | 'exported'>('idle')

function onExportClick() {
  exportState.value = 'exporting'
  const startDate: DateValue | undefined = state.dateRange.start
  const endDate: DateValue | undefined = state.dateRange.end
  const dateRange = {
    start: startDate
      ? (startDate as DateValue).toDate('UTC').toISOString()
      : undefined,
    end: endDate
      ? (endDate as DateValue).toDate('UTC').toISOString()
      : undefined,
  }
  const queue = exporter.exportProject({
    pages: state.selectedPages,
    fileFormat: state.fileFormat,
    i18nKey: state.i18nKey,
    dateRange,
  })
  exportTasks.value =
    queue?.tasks.map((t) => {
      return {
        id: t.options.id,
        name: t.options.name,
        description: t.options.description,
        state: t.options.state,
      }
    }) || []

  const replaceState = (taskID: string, state: TaskState) => {
    exportTasks.value = exportTasks.value.map((t) => {
      if (t.id === taskID) {
        return {
          ...t,
          state,
        }
      }
      return t
    })
  }
  queue?.addEventListener('start', (e: any) => {
    replaceState(e.detail.info.id, e.detail.state)
  })
  queue?.addEventListener('success', (e: any) => {
    replaceState(e.detail.info.id, e.detail.state)
  })
  queue?.addEventListener('timeout', (e: any) => {
    replaceState(e.detail.info.id, e.detail.state)
  })
  queue?.addEventListener('error', (e: any) => {
    replaceState(e.detail.info.id, e.detail.state)
  })
  queue?.addEventListener('end', () => {
    exportState.value = 'exported'
  })
  queue?.start()
}

const showPrevButton = computed(() => {
  return exportState.value === 'idle' && stepper?.value?.hasPrev
})
const showNextButton = computed(() => {
  return exportState.value === 'idle' && stepper?.value?.hasNext
})
</script>

<template>
  <UModal
    title="Export Project"
    class="min-w-[40rem]"
    :dismissible="exportState !== 'exporting'"
    :ui="{
      close: exportState === 'exporting' ? 'hidden' : '',
      footer: showPrevButton ? 'justify-between gap-4' : 'justify-end gap-4',
    }"
    @update:open="(isOpen: boolean) => !isOpen && emit('close', false)"
  >
    <template #body>
      <UStepper ref="stepper" v-model="curStep" :items="steps" disabled>
        <template #step1>
          <div class="flex items-center gap-2 p-3.5 bg-gray-50 mb-2 rounded">
            <UCheckbox v-model="selectAllPages" label="Select All" />
          </div>
          <div class="overflow-auto" style="max-height: 31.25rem">
            <UCheckboxGroup
              v-model="state.selectedPages"
              :items="pageItems"
              variant="card"
            />
          </div>
        </template>

        <template #step2>
          <div class="flex flex-col gap-3.5">
            <UFormField
              class="flex items-center justify-between"
              label="Include I18nKey"
              description="Include empty i18n key tags"
            >
              <USwitch v-model="state.i18nKey" />
            </UFormField>
            <UFormField
              class="flex items-center justify-between"
              label="Date Range"
              description="Filter tags by date range"
            >
              <UPopover>
                <UButton
                  color="neutral"
                  variant="subtle"
                  icon="i-lucide-calendar"
                >
                  <template v-if="state.dateRange.start">
                    <template v-if="state.dateRange.end">
                      {{
                        $dayjs(
                          (state.dateRange.start as DateValue).toDate(
                            getLocalTimeZone()
                          )
                        ).format('YYYY-MM-DD')
                      }}
                      /
                      {{
                        $dayjs(
                          (state.dateRange.end as DateValue).toDate(
                            getLocalTimeZone()
                          )
                        ).format('YYYY-MM-DD')
                      }}
                    </template>
                    <template v-else>
                      {{
                        $dayjs(
                          (state.dateRange.start as DateValue).toDate(
                            getLocalTimeZone()
                          )
                        ).format('YYYY-MM-DD')
                      }}
                    </template>
                  </template>
                  <template v-else> Pick a date </template>
                </UButton>
                <template #content>
                  <UCalendar
                    v-model="state.dateRange"
                    class="p-2"
                    range
                    :number-of-months="2"
                    :is-date-unavailable="
                      (date: DateValue) =>
                        date.compare(today(getLocalTimeZone())) > 0
                    "
                  />
                </template>
              </UPopover>
            </UFormField>
          </div>
        </template>

        <template #step3>
          <div class="w-full flex items-center justify-center gap-8">
            <div
              v-for="item in fileItems"
              :key="item.value"
              :class="[
                'border border-gray-200 rounded p-3.5 hover:border-green-300 cursor-pointer',
                state.fileFormat.includes(item.value)
                  ? 'border-green-400'
                  : 'grayscale',
              ]"
              @click="() => onFileFormatClick(item.value)"
            >
              <div class="flex flex-col items-center gap-2.5">
                <UIcon size="64" :name="item.icon" />
                {{ item.label }}
              </div>
            </div>
          </div>
        </template>

        <template #step4>
          <div class="flex flex-col gap-2 py-2.5 px-10">
            <div
              v-for="task in exportTasks"
              :key="task.id"
              class="flex items-center gap-4"
            >
              <UIcon
                v-if="task.state === TaskState.Pending"
                name="i-eos-icons:three-dots-loading"
                size="20"
              />
              <UIcon
                v-else-if="task.state === TaskState.Running"
                class="text-green-400"
                name="i-eos-icons:bubble-loading"
                size="20"
              />
              <UIcon
                v-else-if="task.state === TaskState.Timeout"
                class="text-yellow-400"
                name="i-lucide:clock"
                size="20"
              />
              <UIcon
                v-else-if="task.state === TaskState.Error"
                class="text-red-400"
                name="i-lucide:x"
                size="20"
              />
              <UIcon
                v-else-if="task.state === TaskState.Success"
                class="text-green-400"
                name="i-lucide:check"
                size="20"
              />
              <div class="flex flex-col gap-1 grow">
                <p class="font-bold">Task: {{ task.name }}</p>
                <p class="text-xs color-secondary">
                  <span v-if="task.state === TaskState.Pending"
                    >Pending...</span
                  >
                  <span v-else-if="task.state === TaskState.Running">
                    {{ task.description }}
                  </span>
                  <span
                    v-else-if="task.state === TaskState.Timeout"
                    class="text-yellow-500"
                  >
                    Timeout
                  </span>
                  <span
                    v-else-if="task.state === TaskState.Error"
                    class="text-red-500"
                  >
                    Error
                  </span>
                  <span
                    v-else-if="task.state === TaskState.Success"
                    class="text-green-500"
                  >
                    Success
                  </span>
                </p>
              </div>
            </div>
          </div>
        </template>
      </UStepper>
    </template>
    <template #footer>
      <UButton
        v-if="showPrevButton"
        color="neutral"
        variant="ghost"
        label="Back"
        icon="i-lucide:arrow-left"
        @click="() => stepper?.prev()"
      />
      <UButton
        v-if="showNextButton"
        color="primary"
        label="Next"
        trailing-icon="i-lucide:arrow-right"
        :disabled="!state.selectedPages.length || !state.fileFormat.length"
        @click="() => stepper?.next()"
      />
      <UButton
        v-else-if="exportState === 'idle'"
        color="primary"
        label="Export"
        icon="i-lucide:hard-drive-download"
        :disabled="!exporter.ready"
        @click="onExportClick"
      />
      <UButton
        v-else-if="exportState === 'exported'"
        color="primary"
        label="Done"
        icon="i-lucide:check"
        @click="emit('close', false)"
      />
    </template>
  </UModal>
</template>
