<script setup lang="tsx">
import type { DropdownMenuItem, TableColumn, TableRow } from '@nuxt/ui'
import type { Column } from '@tanstack/vue-table'
import {
  DEFAULT_LOCALES,
  TRANSLATION_LANGUAGES,
} from '#shared/constants'
import { UBadge, UButton, UCheckbox, UIcon, UInput } from '#components'
import { useDebounceFn } from '@vueuse/core'

definePageMeta({
  middleware: ['protected'],
  ssr: false,
})

const projectStore = useProjectStore()
const { projects, curProject } = storeToRefs(projectStore)
const { loggedIn } = useUserSession()
const toast = useToast()
const table = useTemplateRef('table')

const q = ref('')
const page = ref(1)
const limit = 20
const total = ref(0)
const rows = ref<II18nKeyRow[]>([])
const loading = ref(false)
const publishing = ref(false)
const drafts = ref<Record<string, string>>({})
const rowSelection = ref<Record<string, boolean>>({})

const projectItems = computed(() =>
  projects.value.map((p) => ({
    label: p.name,
    value: p.id,
  }))
)

const selectedProjectId = computed({
  get: () => curProject.value.id || undefined,
  set: (id: ID | undefined) => {
    if (id == null) return
    const found = projects.value.find((p) => String(p.id) === String(id))
    if (found) projectStore.setCurrentProject(found)
  },
})

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

const localeCodes = computed(() =>
  parseLocales(curProject.value.settings?.locales)
)

function localeMeta(code: string) {
  return TRANSLATION_LANGUAGES.find((l) => l.value === code)
}

function cellKey(rowId: ID, locale: string) {
  return `${rowId}:${locale}`
}

function draftOf(row: II18nKeyRow, locale: string) {
  return row.locales.find((l) => l.locale === locale)?.draftText ?? ''
}

function cellDraft(row: II18nKeyRow, locale: string) {
  return drafts.value[cellKey(row.id, locale)] ?? draftOf(row, locale)
}

function setCellDraft(row: II18nKeyRow, locale: string, value: string) {
  drafts.value = { ...drafts.value, [cellKey(row.id, locale)]: value }
}

const selectedKeyIds = computed(() =>
  Object.entries(rowSelection.value)
    .filter(([, selected]) => selected)
    .map(([id]) => Number(id))
    .filter((id) => Number.isInteger(id) && id > 0)
)

const dirtyCount = computed(() => rows.value.filter((r) => r.dirty).length)

const columnPinning = ref({
  left: ['select', 'key'],
  right: ['actions'],
})

function pinHeader(
  column: Column<II18nKeyRow, unknown>,
  label: string,
  position: 'left' | 'right' = 'left'
) {
  const isPinned = column.getIsPinned()
  return (
    <div class="flex items-center gap-1">
      <span>{label}</span>
      <UButton
        color="neutral"
        variant="ghost"
        size="xs"
        square
        icon={isPinned ? 'i-lucide:pin-off' : 'i-lucide:pin'}
        onClick={() => column.pin(isPinned === position ? false : position)}
      />
    </div>
  )
}

const columns = computed<TableColumn<II18nKeyRow>[]>(() => [
  {
    id: 'select',
    header: ({ table }) => (
      <UCheckbox
        modelValue={table.getIsAllPageRowsSelected()}
        indeterminate={table.getIsSomePageRowsSelected()}
        onUpdate:modelValue={(value: boolean | 'indeterminate') =>
          table.toggleAllPageRowsSelected(!!value)
        }
      />
    ),
    cell: ({ row }) => (
      <UCheckbox
        modelValue={row.getIsSelected()}
        onUpdate:modelValue={(value: boolean | 'indeterminate') =>
          row.toggleSelected(!!value)
        }
      />
    ),
    enableHiding: false,
    enableSorting: false,
    size: 48,
  },
  {
    id: 'key',
    accessorKey: 'key',
    header: ({ column }) => pinHeader(column, 'Key'),
    enableHiding: false,
    size: 200,
    cell: ({ row }: { row: TableRow<II18nKeyRow> }) => (
      <code class="text-xs font-mono break-all">{row.original.key}</code>
    ),
  },
  {
    id: 'origin',
    accessorKey: 'origin',
    header: ({ column }) => pinHeader(column, 'Origin'),
    enableHiding: false,
    size: 220,
    cell: ({ row }: { row: TableRow<II18nKeyRow> }) => (
      <div
        class="max-w-56 line-clamp-2 text-muted"
        title={row.original.origin || ''}
      >
        {row.original.origin || '—'}
      </div>
    ),
  },
  {
    id: 'tagCount',
    accessorKey: 'tagCount',
    header: 'Tags',
    size: 80,
    cell: ({ row }: { row: TableRow<II18nKeyRow> }) => (
      <UBadge variant="subtle" color="neutral">
        {String(row.original.tagCount)}
      </UBadge>
    ),
  },
  {
    id: 'status',
    accessorKey: 'dirty',
    header: ({ column }) => pinHeader(column, 'Status'),
    size: 120,
    cell: ({ row }: { row: TableRow<II18nKeyRow> }) => (
      <UBadge
        color={row.original.dirty ? 'warning' : 'success'}
        variant="subtle"
      >
        {row.original.dirty ? 'Draft' : 'Published'}
      </UBadge>
    ),
  },
  ...localeCodes.value.map((code) => {
    const meta = localeMeta(code)
    return {
      id: code,
      header: ({ column }: { column: Column<II18nKeyRow, unknown> }) => (
        <div class="flex items-center gap-1">
          {meta ? <UIcon name={meta.icon} size="14" /> : null}
          <span>{meta?.short || code}</span>
          <UButton
            color="neutral"
            variant="ghost"
            size="xs"
            square
            icon={column.getIsPinned() ? 'i-lucide:pin-off' : 'i-lucide:pin'}
            onClick={() =>
              column.pin(column.getIsPinned() === 'left' ? false : 'left')
            }
          />
        </div>
      ),
      enableHiding: true,
      size: 200,
      cell: ({ row }: { row: TableRow<II18nKeyRow> }) => {
        const original = row.original
        return (
          <UInput
            modelValue={cellDraft(original, code)}
            size="sm"
            class="min-w-44"
            onUpdate:modelValue={(v: string) =>
              setCellDraft(original, code, v ?? '')
            }
            onBlur={() => saveDraft(original, code, cellDraft(original, code))}
          />
        )
      },
    } as TableColumn<II18nKeyRow>
  }),
  {
    id: 'actions',
    header: ({ column }) => pinHeader(column, '', 'right'),
    enableHiding: false,
    size: 110,
    cell: ({ row }: { row: TableRow<II18nKeyRow> }) => (
      <UButton
        size="xs"
        variant="outline"
        color="neutral"
        label="Publish"
        disabled={!row.original.dirty || publishing.value}
        onClick={() => publishKeys([Number(row.original.id)])}
      />
    ),
  },
])

const columnsDropdownItems = computed<DropdownMenuItem[]>(() => {
  if (!table.value) return []
  const allColumns: any[] = table.value.tableApi.getAllColumns()
  return allColumns
    .filter((col) => col.getCanHide())
    .map((col) => {
      const trans = TRANSLATION_LANGUAGES.find((lang) => lang.value === col.id)
      return {
        type: 'checkbox' as const,
        label: trans?.short || col.id,
        icon: trans?.icon,
        checked: col.getIsVisible(),
        onUpdateChecked(checked: boolean) {
          table.value?.tableApi.getColumn(col.id)?.toggleVisibility(!!checked)
        },
        onSelect(e: Event) {
          e.preventDefault()
        },
      }
    })
})

async function loadKeys() {
  if (!validID(curProject.value.id)) {
    rows.value = []
    total.value = 0
    return
  }
  loading.value = true
  rowSelection.value = {}
  try {
    const params = new URLSearchParams({
      page: String(page.value),
      limit: String(limit),
    })
    if (q.value.trim()) params.set('q', q.value.trim())
    const res = await useApi<IPagination<II18nKeyRow[]>>(
      `/api/projects/${curProject.value.id}/i18n-keys?${params.toString()}`
    )
    if (!res) return
    rows.value = res.data ?? []
    total.value = res.total
    page.value = res.page
    const next: Record<string, string> = {}
    for (const row of rows.value) {
      for (const code of localeCodes.value) {
        next[cellKey(row.id, code)] = draftOf(row, code)
      }
    }
    drafts.value = next
  } finally {
    loading.value = false
  }
}

const searchDebounced = useDebounceFn(() => {
  page.value = 1
  loadKeys()
}, 300)

watch(q, () => {
  searchDebounced()
})

watch(
  () => curProject.value.id,
  () => {
    page.value = 1
    loadKeys()
  }
)

async function saveDraft(row: II18nKeyRow, locale: string, value: string) {
  const previous = draftOf(row, locale)
  if (previous === value) return
  await useApi(`/api/translation/${row.id}/vue`, {
    method: 'POST',
    body: { [locale]: value },
  })
  const localeRow = row.locales.find((l) => l.locale === locale)
  if (localeRow) {
    localeRow.draftText = value
  } else {
    row.locales.push({
      locale,
      draftText: value,
      publishedText: null,
    })
  }
  row.dirty = row.locales.some(
    (l) => (l.draftText ?? '') !== (l.publishedText ?? '')
  )
}

async function publishKeys(keyIds?: number[]) {
  if (!validID(curProject.value.id)) return
  publishing.value = true
  try {
    const res = await useApi<{ updated: number }>(
      `/api/projects/${curProject.value.id}/publish`,
      {
        method: 'POST',
        body: keyIds?.length ? { keyIds } : {},
      }
    )
    toast.add({
      title: 'Published',
      description: `${res?.updated ?? 0} locale row(s) published`,
      color: 'success',
      icon: 'i-lucide:check',
    })
    await loadKeys()
  } finally {
    publishing.value = false
  }
}

onMounted(async () => {
  if (loggedIn.value && projects.value.length === 0) {
    await projectStore.getProjects()
  }
  await loadKeys()
})
</script>

<template>
  <div class="h-full min-w-0 overflow-hidden flex flex-col bg-muted">
    <header
      class="shrink-0 px-6 py-5 bg-default border-b border-default flex items-start justify-between gap-6"
    >
      <div class="min-w-0">
        <h1 class="text-xl font-semibold tracking-tight">Translations</h1>
        <p class="mt-1 text-sm text-muted">
          Edit drafts in the table, then publish to the JSON API.
        </p>
      </div>
      <div class="flex items-center gap-2 shrink-0">
        <UButton
          color="neutral"
          variant="outline"
          label="Publish selected"
          icon="i-lucide:check-check"
          :loading="publishing"
          :disabled="selectedKeyIds.length === 0"
          @click="publishKeys(selectedKeyIds)"
        />
        <UButton
          color="primary"
          label="Publish all"
          icon="i-lucide:upload"
          :loading="publishing"
          :disabled="!validID(curProject.id) || rows.length === 0"
          @click="publishKeys()"
        />
      </div>
    </header>

    <div class="flex-1 min-h-0 min-w-0 p-6 flex flex-col gap-4 overflow-hidden">
      <div
        class="shrink-0 flex flex-wrap items-center gap-3 rounded-xl border border-default bg-default px-4 py-3"
      >
        <USelect
          v-model="selectedProjectId"
          class="w-56"
          placeholder="Select project"
          :items="projectItems"
        />
        <UInput
          v-model="q"
          class="w-72"
          icon="i-lucide:search"
          placeholder="Search key or origin"
        />
        <UBadge
          v-if="validID(curProject.id)"
          color="neutral"
          variant="subtle"
        >
          {{ total }} keys
        </UBadge>
        <UBadge v-if="dirtyCount" color="warning" variant="subtle">
          {{ dirtyCount }} unpublished
        </UBadge>
        <div class="ml-auto flex items-center gap-2">
          <UDropdownMenu
            :items="columnsDropdownItems"
            :content="{ align: 'end' }"
            :ui="{ group: 'max-h-64 overflow-auto' }"
          >
            <UButton
              label="Columns"
              color="neutral"
              variant="outline"
              trailing-icon="i-lucide-chevron-down"
            />
          </UDropdownMenu>
          <UButton
            color="neutral"
            variant="ghost"
            icon="i-lucide:refresh-cw"
            :loading="loading"
            @click="loadKeys"
          />
        </div>
      </div>

      <div
        class="flex-1 min-h-0 min-w-0 rounded-xl border border-default bg-default overflow-hidden flex flex-col"
      >
        <div class="flex-1 min-h-0 min-w-0 overflow-hidden">
          <UTable
            ref="table"
            v-model:row-selection="rowSelection"
            v-model:column-pinning="columnPinning"
            sticky="header"
            class="h-full"
            :data="rows"
            :columns="columns"
            :loading="loading"
            :get-row-id="(row: II18nKeyRow) => String(row.id)"
            :ui="{
              root: 'h-full overflow-auto',
              base: 'min-w-max',
              th: 'bg-default',
              td: 'align-top bg-default',
            }"
          >
            <template #empty>
              <div class="py-12 text-center text-sm text-muted">
                {{
                  validID(curProject.id)
                    ? 'No keys yet. Create tags in the editor to populate this table.'
                    : 'Select a project to manage translations.'
                }}
              </div>
            </template>
          </UTable>
        </div>
        <div
          v-if="total > 0"
          class="shrink-0 flex items-center justify-between px-4 py-3 border-t border-default"
        >
          <p class="text-xs text-muted">
            Page {{ page }} · {{ rows.length }} of {{ total }}
          </p>
          <UPagination
            :page="page"
            :items-per-page="limit"
            :total="total"
            @update:page="
              (p: number) => {
                page = p
                loadKeys()
              }
            "
          />
        </div>
      </div>
    </div>
  </div>
</template>
