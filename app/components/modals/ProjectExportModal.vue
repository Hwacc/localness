<script setup lang="ts">
import type { CheckboxGroupItem } from '@nuxt/ui'
import { compact } from 'lodash-es'
import { DEFAULT_LOCALES, TRANSLATION_LANGUAGES } from '#shared/constants'
import { exportBundleName } from '#shared/utils/file'
import { releaseNameForExport } from '#shared/utils/release'
import { TaskState } from '~/libs/task-queue/types'
import { useDebounceFn } from '@vueuse/core'

const { $dayjs } = useNuxtApp()
const projectStore = useProjectStore()

function parseLocales(raw: unknown): string[] {
  if (Array.isArray(raw) && raw.every((v) => typeof v === 'string')) {
    return raw as string[]
  }
  if (typeof raw === 'string') {
    try {
      const parsed = JSON.parse(raw)
      if (Array.isArray(parsed)) return parsed
    } catch {
      return [...DEFAULT_LOCALES]
    }
  }
  return [...DEFAULT_LOCALES]
}

/** Column set and order follow the project, same as the Translations table. */
const projectLocales = computed(() =>
  parseLocales(projectStore.curProject?.settings?.locales)
)
const fallbackLocale = computed(
  () => projectStore.curProject?.settings?.localeFallback || 'en'
)

const state = reactive({
  selectedPages:
    projectStore.curProject?.pages?.map((page) => page.id + '') || [],
  selectedKeyIds: [] as number[],
  selectedLocales: [] as string[],
  includeFallbackLocale: true,
  fileFormat: ['xlsx'] as ('xlsx' | 'json')[],
})

state.selectedLocales = [...projectLocales.value]

const selectedPageIds = computed(() =>
  state.selectedPages.map((id) => Number(id)).filter(Number.isInteger)
)

function localeLabel(code: string) {
  return TRANSLATION_LANGUAGES.find((l) => l.value === code)?.short ?? code
}

function toggleLocale(code: string) {
  const index = state.selectedLocales.indexOf(code)
  if (index > -1) state.selectedLocales.splice(index, 1)
  else state.selectedLocales.push(code)
}

/** Locale columns as the server will build them, for the summary line. */
const localeColumns = computed(() => {
  const picked = projectLocales.value.filter((code) =>
    state.selectedLocales.includes(code)
  )
  if (
    state.includeFallbackLocale &&
    fallbackLocale.value &&
    !picked.includes(fallbackLocale.value)
  ) {
    return [fallbackLocale.value, ...picked]
  }
  return picked
})

type ExportSummary = {
  keys: number
  rows: number
  tags: number
  pages: number
  locales: string[]
  keysWithoutTag: number
  skipped: Record<string, number>
}

const summary = ref<ExportSummary | null>(null)
const summaryLoading = ref(false)

function selectionBody() {
  return {
    pages: state.selectedPages,
    keyIds: state.selectedKeyIds,
    locales: state.selectedLocales,
    includeFallbackLocale: state.includeFallbackLocale,
  }
}

async function loadSummary() {
  if (!validID(projectStore.curProject.id) || !state.selectedKeyIds.length) {
    summary.value = null
    return
  }
  summaryLoading.value = true
  try {
    summary.value =
      (await useApi<ExportSummary>(
        `/api/projects/${projectStore.curProject.id}/export/summary`,
        { method: 'POST', body: selectionBody() }
      )) ?? null
  } finally {
    summaryLoading.value = false
  }
}

const summaryDebounced = useDebounceFn(loadSummary, 300)

watch(
  () => [
    state.selectedKeyIds.length,
    state.selectedLocales.length,
    state.includeFallbackLocale,
    selectedPageIds.value.length,
  ],
  () => summaryDebounced()
)

const curStep = ref(0)
const stepper = useTemplateRef<any>('stepper')
const exporter = useProjectExport()

/* A release is resolved into the selection the export already takes, so no export rule changes. */
const releaseScoped = computed(() => projectStore.curReleaseFilter !== 'all')
const releaseLabel = computed(() =>
  releaseFilterLabel(projectStore.curReleaseFilter, projectStore.curReleases)
)

const applyingRelease = ref(false)

async function applyReleaseScope() {
  const filter = projectStore.curReleaseFilter
  const projectId = projectStore.curProject.id
  if (!releaseScoped.value || !validID(projectId)) return
  applyingRelease.value = true
  try {
    state.selectedPages = (projectStore.curProject.pages ?? [])
      .filter((page) => pageMatchesReleaseFilter(page, filter))
      .map((page) => page.id + '')
    // `idsOnly` is the endpoint's "select all matching".
    const res = await useApi<{ ids: number[] }>(
      `/api/projects/${projectId}/i18n-keys`,
      {
        query: {
          idsOnly: '1',
          ...(filter === 'unassigned'
            ? { unassigned: '1' }
            : { releaseId: String(filter) }),
        },
      }
    )
    state.selectedKeyIds = res?.ids ?? []
    await loadSummary()
  } finally {
    applyingRelease.value = false
  }
}

onMounted(() => {
  // The overlay remounts per open, so this always starts from the current release.
  if (releaseScoped.value) void applyReleaseScope()
})

const emit = defineEmits<{
  close: [boolean]
}>()

const steps = [
  {
    title: 'Pages & images',
    icon: 'i-material-symbols:imagesmode-outline',
    slot: 'step1',
  },
  {
    title: 'Keys & locales',
    icon: 'i-lucide:filter',
    slot: 'step2',
  },
  {
    title: 'File format',
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
    hint: 'A sheet with one row per tag, plus one annotated screenshot per page',
  },
  {
    label: 'JSON',
    value: 'json',
    icon: 'i-vscode-icons:file-type-json',
    hint: 'Flat { key: text } per locale, published text only, no screenshots',
  },
] as const

/** The summary describes a sheet, so its numbers only apply when XLSX is on. */
const wantsXlsx = computed(() => state.fileFormat.includes('xlsx'))

/* Named by the same rule the exporter uses, so the two cannot drift. */
const exportFileName = computed(
  () =>
    `${exportBundleName({
      projectName: projectStore.curProject.name,
      releaseName: releaseNameForExport(
        projectStore.curReleaseFilter,
        projectStore.curReleases,
      ),
    })}.zip`,
)

function onFileFormatClick(val: 'xlsx' | 'json') {
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
  const queue = exporter.exportProject({
    ...selectionBody(),
    fileFormat: state.fileFormat,
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

/** Each step guards its own requirement, so Next explains itself in place. */
const nextDisabled = computed(() => {
  // Pages only scope screenshots and tag rows. Zero pages is a valid keys-only
  // export: XLSX still writes pic-less rows, JSON never needed pages.
  if (curStep.value === 0) return false
  if (curStep.value === 1) {
    return !state.selectedKeyIds.length || !localeColumns.value.length
  }
  return !state.fileFormat.length
})

const canExport = computed(
  () =>
    // The worker renders screenshots and encodes the sheet; JSON needs neither.
    (!wantsXlsx.value || exporter.ready) &&
    state.selectedKeyIds.length > 0 &&
    localeColumns.value.length > 0 &&
    (summary.value ? summary.value.rows > 0 : true)
)
</script>

<template>
  <UModal
    title="Export Project"
    class="min-w-208 max-w-[92vw]"
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
          <div class="flex items-center gap-2 p-3.5 bg-muted mb-2 rounded">
            <UCheckbox
              v-if="pageItems.length"
              v-model="selectAllPages"
              label="Select All"
            />
            <span
              v-else
              class="text-sm text-muted"
            >
              No pages to select
            </span>
            <UButton
              v-if="releaseScoped"
              class="ml-auto"
              size="xs"
              color="neutral"
              variant="outline"
              icon="i-lucide:tag"
              :label="`Use all of “${releaseLabel}”`"
              :loading="applyingRelease"
              @click="applyReleaseScope"
            />
          </div>
          <div class="overflow-auto" style="max-height: 31.25rem">
            <div
              v-if="!pageItems.length"
              class="rounded-lg border border-default p-3 text-sm text-muted"
            >
              This project has no pages. Continue to pick keys — published text
              still exports. XLSX will skip screenshots.
            </div>
            <UCheckboxGroup
              v-else
              v-model="state.selectedPages"
              :items="pageItems"
              variant="card"
            />
          </div>
          <p
            v-if="pageItems.length && wantsXlsx && !state.selectedPages.length"
            class="mt-2 text-xs text-muted"
          >
            No pages selected — the sheet will have no screenshots.
          </p>
        </template>

        <template #step2>
          <div class="flex flex-col gap-3">
            <div class="flex items-start gap-3">
              <span
                class="shrink-0 pt-1 text-xs font-medium text-muted uppercase"
              >
                Locale columns
              </span>
              <div class="flex flex-wrap items-center gap-1.5">
                <UBadge
                  v-for="code in projectLocales"
                  :key="code"
                  class="cursor-pointer"
                  :variant="
                    state.selectedLocales.includes(code) ? 'subtle' : 'outline'
                  "
                  :color="
                    state.selectedLocales.includes(code) ? 'primary' : 'neutral'
                  "
                  :title="code"
                  @click="toggleLocale(code)"
                >
                  {{ localeLabel(code) }}
                </UBadge>
              </div>
              <UCheckbox
                v-model="state.includeFallbackLocale"
                class="ml-auto shrink-0"
                :label="`Always include ${fallbackLocale}`"
                :ui="{ label: 'text-xs whitespace-nowrap' }"
              />
            </div>

            <I18nKeyPickerTable
              v-model="state.selectedKeyIds"
              :project-id="projectStore.curProject.id"
              :page-ids="selectedPageIds"
              :release-filter="projectStore.curReleaseFilter"
            />

            <div
              class="rounded-lg border border-default px-3 py-2 text-xs flex flex-col gap-1"
            >
              <p v-if="!state.selectedKeyIds.length" class="text-muted">
                Pick at least one key. Export ships published text only.
              </p>
              <template v-else-if="summary">
                <p v-if="wantsXlsx">
                  <span class="font-medium">{{ summary.rows }}</span> row(s) ·
                  {{ summary.tags }} tag(s) on {{ summary.pages }} page(s) ·
                  {{ summary.locales.length }} locale column(s)
                </p>
                <p v-else>
                  <span class="font-medium">{{ summary.keys }}</span> key(s)
                  across up to {{ summary.locales.length }} locale file(s)
                </p>
                <p v-if="summary.skipped['no-published-text']" class="text-amber-400">
                  {{ summary.skipped['no-published-text'] }} selected key(s)
                  have no published text — they are skipped.
                </p>
                <p v-if="wantsXlsx && summary.keysWithoutTag" class="text-muted">
                  {{ summary.keysWithoutTag }} key(s) have no tag on these
                  pages — exported with an empty pic.
                </p>
              </template>
              <p v-else class="text-muted">
                {{ summaryLoading ? 'Checking selection…' : '—' }}
              </p>
            </div>
          </div>
        </template>

        <template #step3>
          <div class="w-full flex flex-col items-center gap-3">
            <div class="flex items-center justify-center gap-8">
              <UTooltip
                v-for="item in fileItems"
                :key="item.value"
                :text="item.hint"
              >
                <div
                  :class="[
                    'relative border border-default rounded p-3.5 cursor-pointer hover:border-green-300',
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
              </UTooltip>
            </div>
            <p class="text-xs text-muted text-center max-w-md">
              XLSX carries the screenshots; JSON is text only, one flat file per
              locale, and both ship published text. Picking both puts them in one
              zip.
            </p>
          </div>
        </template>

        <template #step4>
          <div class="flex flex-col gap-2 py-2.5 px-10">
            <p class="text-sm">
              <span class="text-muted">File name: </span>
              <span class="font-medium">{{ exportFileName }}</span>
            </p>
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
        :disabled="nextDisabled"
        @click="() => stepper?.next()"
      />
      <UButton
        v-else-if="exportState === 'idle'"
        color="primary"
        label="Export"
        icon="i-lucide:hard-drive-download"
        :disabled="!canExport"
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
