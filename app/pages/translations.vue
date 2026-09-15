<script setup lang="tsx">
import type { DropdownMenuItem, TableColumn, TableRow } from '@nuxt/ui'
import type { Column } from '@tanstack/vue-table'
import {
  DEFAULT_LOCALES,
  I18nKeyStatusFilter,
  TRANSLATION_LANGUAGES,
} from '#shared/constants'
import { formatI18nKeyDisplay } from '#shared/utils'
import { UBadge, UButton, UCheckbox, UIcon, UInput, UTooltip, AlertModal, I18nKeyModal } from '#components'
import { useDebounceFn } from '@vueuse/core'
import {
  getLocalTimeZone,
  today,
  type DateValue,
} from '@internationalized/date'

definePageMeta({
  middleware: ['protected'],
  ssr: false,
})

const { $dayjs } = useNuxtApp()
const projectStore = useProjectStore()
const pageStore = usePageStore()
const { curProject } = storeToRefs(projectStore)
const { loggedIn } = useUserSession()
const toast = useToast()
const table = useTemplateRef('table')

const q = ref('')
const statusFilter = ref<I18nKeyStatusFilter>(I18nKeyStatusFilter.ALL)
/**
 * This is the key table, so auto draft keys (`__draft_…` created by tagging a
 * screenshot) are visible by default — hiding them made a freshly tagged
 * translation unreachable from any status filter. The picker table defaults the
 * other way because there you are choosing keys to export.
 */
const includeDraftKeys = ref(true)
const page = ref(1)
const limit = 20
const total = ref(0)
const rows = ref<II18nKeyRow[]>([])
const loading = ref(false)
const publishing = ref(false)
const drafts = ref<Record<string, string>>({})
const rowSelection = ref<Record<string, boolean>>({})

/**
 * Filters `updatedAt`, the column the table is already sorted by. A `ref`, not
 * `reactive`: the range calendar replaces the whole object on every click, so
 * `v-model` needs something it can assign to. Left untyped because @nuxt/ui
 * bundles its own copy of @internationalized/date and annotating the value as
 * `DateValue` makes `v-model` a type error.
 */
const dateRange = ref({ start: undefined, end: undefined })

/** The calendar writes its own `DateValue` into the untyped range above. */
function asDate(value: unknown) {
  return (value ?? undefined) as DateValue | undefined
}

const hasDateRange = computed(() =>
  Boolean(dateRange.value.start || dateRange.value.end)
)

function formatRangeDay(value: DateValue) {
  return $dayjs(value.toDate(getLocalTimeZone())).format('YYYY-MM-DD')
}

const dateRangeLabel = computed(() => {
  const start = asDate(dateRange.value.start)
  const end = asDate(dateRange.value.end)
  if (!start) return 'Updated: any time'
  if (!end) return formatRangeDay(start)
  return `${formatRangeDay(start)} / ${formatRangeDay(end)}`
})

function clearDateRange() {
  dateRange.value = { start: undefined, end: undefined }
}

const statusItems = [
  { label: 'All statuses', value: I18nKeyStatusFilter.ALL },
  { label: 'Draft', value: I18nKeyStatusFilter.DRAFT },
  { label: 'Published', value: I18nKeyStatusFilter.PUBLISHED },
]

/** Selected rows split by status — bulk actions only apply to one side each. */
const selectedRows = computed(() =>
  rows.value.filter((r) => rowSelection.value[String(r.id)])
)
const selectedDraftIds = computed(() =>
  selectedRows.value.filter((r) => r.dirty).map((r) => Number(r.id))
)
const selectedPublishedIds = computed(() =>
  selectedRows.value.filter((r) => !r.dirty).map((r) => Number(r.id))
)

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


const columnPinning = ref({
  left: ['select', 'key'],
  right: ['actions'],
})

const overlay = useOverlay()
const editModal = overlay.create(I18nKeyModal)
const deleteModal = overlay.create(AlertModal)
const unpublishModal = overlay.create(AlertModal)

function openCreate() {
  if (!validID(curProject.value.id)) return
  editModal.open({
    locales: localeCodes.value,
    projectId: curProject.value.id,
    onSaved: () => loadKeys(),
  })
}

function openEdit(row: II18nKeyRow) {
  if (!validID(curProject.value.id)) return
  editModal.open({
    row,
    locales: localeCodes.value,
    projectId: curProject.value.id,
    readonly: !row.dirty,
    onSaved: () => loadKeys(),
  })
}

function openUnpublish(row: II18nKeyRow) {
  if (row.dirty || !validID(curProject.value.id)) return
  unpublishModal.open({
    mode: 'warning',
    title: 'Revert to draft',
    message: `Revert “${formatI18nKeyDisplay(row.key)}” to draft? It will drop out of published export until you publish again.`,
    okText: 'Revert',
    onOk: async (_mode, { close }) => {
      unpublishModal.patch({ loading: true })
      try {
        await unpublishKeys([Number(row.id)])
        close()
      } finally {
        unpublishModal.patch({ loading: false })
      }
    },
  })
}

function openBulkDelete() {
  const targets = selectedRows.value.filter((r) => r.dirty)
  if (!targets.length) return
  const tagTotal = targets.reduce((sum, r) => sum + (r.tagCount ?? 0), 0)
  const tagHint = tagTotal > 0 ? ` This will also delete ${tagTotal} bound tag(s).` : ''
  deleteModal.open({
    mode: 'delete',
    title: 'Delete translations',
    message: `Delete ${targets.length} draft key(s)?${tagHint} Published keys in your selection are skipped.`,
    onOk: async (_mode, { close }) => {
      deleteModal.patch({ loading: true })
      try {
        // No bulk delete endpoint; a partial failure must still report what
        // did land rather than silently rolling the toast into a success.
        const results = await Promise.allSettled(
          targets.map((row) =>
            useApi(`/api/translation/${row.id}`, { method: 'DELETE' })
          )
        )
        const failed = results.filter((r) => r.status === 'rejected').length
        const deletedIds = new Set(
          targets
            .filter((_, i) => results[i]!.status === 'fulfilled')
            .map((r) => String(r.id))
        )
        pageStore.setTags(
          pageStore.tagList.filter((tag) => {
            const boundId = tag.translationID ?? tag.i18nKeyId
            return !deletedIds.has(String(boundId))
          })
        )
        toast.add({
          title: failed ? 'Partially deleted' : 'Deleted',
          description: `${deletedIds.size} deleted${failed ? `, ${failed} failed` : ''}`,
          color: failed ? 'warning' : 'success',
          icon: failed ? 'i-lucide:triangle-alert' : 'i-lucide:check',
        })
        close()
        rowSelection.value = {}
        await loadKeys()
      } finally {
        deleteModal.patch({ loading: false })
      }
    },
  })
}

function openBulkUnpublish() {
  const ids = selectedPublishedIds.value
  if (!ids.length) return
  unpublishModal.open({
    mode: 'delete',
    title: 'Revert to draft',
    message: `Revert ${ids.length} published key(s) to draft? They will drop out of the published export until published again.`,
    onOk: async (_mode, { close }) => {
      unpublishModal.patch({ loading: true })
      try {
        await unpublishKeys(ids)
        rowSelection.value = {}
        close()
      } finally {
        unpublishModal.patch({ loading: false })
      }
    },
  })
}

function openDelete(row: II18nKeyRow) {
  if (!row.dirty) return
  const tagHint =
    row.tagCount > 0
      ? ` This will also delete ${row.tagCount} bound tag(s).`
      : ''
  deleteModal.open({
    mode: 'delete',
    title: 'Delete translation',
    message: `Delete draft key “${formatI18nKeyDisplay(row.key)}”?${tagHint}`,
    onOk: async (_mode, { close }) => {
      deleteModal.patch({ loading: true })
      try {
        await useApi(`/api/translation/${row.id}`, { method: 'DELETE' })
        pageStore.setTags(
          pageStore.tagList.filter((tag) => {
            const boundId = tag.translationID ?? tag.i18nKeyId
            return String(boundId) !== String(row.id)
          })
        )
        toast.add({
          title: 'Deleted',
          color: 'success',
          icon: 'i-lucide:check',
        })
        close()
        await loadKeys()
      } finally {
        deleteModal.patch({ loading: false })
      }
    },
  })
}

const refsOpen = ref(false)
const refsKeyId = ref<ID | undefined>()

function openTagRefs(row: II18nKeyRow) {
  if (row.tagCount <= 0) return
  refsKeyId.value = row.id
  refsOpen.value = true
}

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
    meta: {
      class: {
        th: 'w-[48px] min-w-[48px] max-w-[48px] px-3',
        td: 'w-[48px] min-w-[48px] max-w-[48px] px-3',
      },
    },
  },
  {
    id: 'key',
    accessorKey: 'key',
    header: ({ column }) => pinHeader(column, 'Key'),
    enableHiding: false,
    size: 200,
    // Pinned: width must match `size` exactly (see the select column).
    meta: {
      class: {
        th: 'w-[200px] min-w-[200px] max-w-[200px]',
        td: 'w-[200px] min-w-[200px] max-w-[200px]',
      },
    },
    cell: ({ row }: { row: TableRow<II18nKeyRow> }) => (
      <code
        class="text-xs font-mono break-all"
        title={row.original.key}
      >
        {formatI18nKeyDisplay(row.original.key)}
      </code>
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
      <div
        class={row.original.tagCount > 0 ? 'cursor-pointer' : 'opacity-50'}
        onClick={() => openTagRefs(row.original)}
      >
        <UBadge variant="subtle" color="neutral">
          {String(row.original.tagCount)}
        </UBadge>
      </div>
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
        const published = !original.dirty
        return (
          <UInput
            modelValue={cellDraft(original, code)}
            size="sm"
            class="min-w-44"
            disabled={published}
            onUpdate:modelValue={(v: string) => {
              if (published) return
              setCellDraft(original, code, v ?? '')
            }}
            onBlur={() => {
              if (published) return
              saveDraft(original, code, cellDraft(original, code))
            }}
          />
        )
      },
    } as TableColumn<II18nKeyRow>
  }),
  {
    id: 'actions',
    header: ({ column }) => pinHeader(column, '', 'right'),
    enableHiding: false,
    size: 148,
    // Pinned right: `getAfter('right')` uses `size`, so the rendered width has
    // to match it (see the select column).
    meta: {
      class: {
        th: 'w-[148px] min-w-[148px] max-w-[148px]',
        td: 'w-[148px] min-w-[148px] max-w-[148px]',
      },
    },
    cell: ({ row }: { row: TableRow<II18nKeyRow> }) => {
      const original = row.original
      const isDraft = original.dirty
      return (
        <div class="flex items-center gap-0.5">
          <UTooltip text={isDraft ? 'Edit' : 'View'}>
            <UButton
              size="xs"
              variant="ghost"
              color="neutral"
              square
              icon={isDraft ? 'i-lucide:pencil' : 'i-lucide:eye'}
              onClick={() => openEdit(original)}
            />
          </UTooltip>
          {isDraft ? (
            <UTooltip text="Publish">
              <UButton
                size="xs"
                variant="ghost"
                color="neutral"
                square
                icon="i-lucide:upload"
                disabled={publishing.value}
                onClick={() => publishKeys([Number(original.id)])}
              />
            </UTooltip>
          ) : (
            <UTooltip text="Revert to draft">
              <UButton
                size="xs"
                variant="ghost"
                color="neutral"
                square
                icon="i-lucide:undo-2"
                disabled={publishing.value}
                onClick={() => openUnpublish(original)}
              />
            </UTooltip>
          )}
          {isDraft ? (
            <UTooltip text="Delete">
              <UButton
                size="xs"
                variant="ghost"
                color="error"
                square
                icon="i-lucide:trash-2"
                onClick={() => openDelete(original)}
              />
            </UTooltip>
          ) : null}
        </div>
      )
    },
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
    if (statusFilter.value !== I18nKeyStatusFilter.ALL) {
      params.set('status', statusFilter.value)
    }
    if (includeDraftKeys.value) params.set('includeDraftKeys', '1')
    // Whole local days, so a single picked day covers that day end to end.
    const start = asDate(dateRange.value.start)
    const end = asDate(dateRange.value.end)
    if (start) {
      params.set(
        'from',
        $dayjs(start.toDate(getLocalTimeZone())).startOf('day').toISOString()
      )
    }
    if (end || start) {
      params.set(
        'to',
        $dayjs((end ?? start)!.toDate(getLocalTimeZone()))
          .endOf('day')
          .toISOString()
      )
    }
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

// Status is a discrete choice, not typing — apply it immediately.
watch([statusFilter, includeDraftKeys], () => {
  page.value = 1
  loadKeys()
})

// Range calendars emit twice (start, then end). Reload on both so a single
// picked day filters right away instead of waiting for the second click.
watch(
  () => [dateRange.value.start, dateRange.value.end],
  () => {
    page.value = 1
    loadKeys()
  }
)

watch(
  () => curProject.value.id,
  () => {
    page.value = 1
    loadKeys()
  }
)

async function saveDraft(row: II18nKeyRow, locale: string, value: string) {
  if (!row.dirty) return
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
  row.dirty = isI18nKeyDraft(row.locales)
}

// Always scoped to explicit keys. The endpoint also accepts an empty body to
// publish the whole project, but no UI offers that — bulk actions cover it.
async function publishKeys(keyIds: number[]) {
  if (!validID(curProject.value.id) || keyIds.length === 0) return
  publishing.value = true
  try {
    const res = await useApi<{ updated: number }>(
      `/api/projects/${curProject.value.id}/publish`,
      {
        method: 'POST',
        body: { keyIds },
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

async function unpublishKeys(keyIds: number[]) {
  if (!validID(curProject.value.id) || keyIds.length === 0) return
  publishing.value = true
  try {
    const res = await useApi<{ updated: number }>(
      `/api/projects/${curProject.value.id}/unpublish`,
      {
        method: 'POST',
        body: { keyIds },
      }
    )
    toast.add({
      title: 'Reverted to draft',
      description: `${res?.updated ?? 0} locale row(s) unpublished`,
      color: 'success',
      icon: 'i-lucide:undo-2',
    })
    await loadKeys()
  } finally {
    publishing.value = false
  }
}

onMounted(async () => {
  if (loggedIn.value && projectStore.projects.length === 0) {
    await projectStore.getProjects()
  }
  await loadKeys()
})
</script>

<template>
  <div class="h-full min-w-0 overflow-hidden flex flex-col bg-muted">
    <header
      class="shrink-0 px-6 py-4 bg-default border-b border-default flex items-center justify-between gap-4"
    >
      <div class="min-w-0 flex items-baseline gap-2">
        <h1 class="text-lg font-semibold tracking-tight">Translations</h1>
        <span v-if="validID(curProject.id)" class="truncate text-sm text-muted">
          {{ curProject.name }}
        </span>
        <ProjectOwnerBadge
          :project="curProject"
          :visible="Boolean(curProject.isSteward)"
        />
      </div>
      <UButton
        class="shrink-0"
        size="sm"
        color="neutral"
        variant="outline"
        label="New translation"
        icon="i-lucide:plus"
        :disabled="!validID(curProject.id)"
        @click="openCreate"
      />
    </header>

    <div class="flex-1 min-h-0 min-w-0 p-6 flex flex-col gap-4 overflow-hidden">
      <div
        class="shrink-0 flex flex-wrap items-center gap-3 rounded-xl border border-default bg-default px-4 py-3"
      >
        <UInput
          v-model="q"
          class="w-72"
          icon="i-lucide:search"
          placeholder="Search key or origin"
        />
        <USelectMenu
          v-model="statusFilter"
          :items="statusItems"
          value-key="value"
          class="w-44"
          :search-input="false"
        />
        <UPopover>
          <UButton
            color="neutral"
            variant="outline"
            icon="i-lucide:calendar"
            :label="dateRangeLabel"
          />
          <template #content>
            <div class="p-2 flex flex-col gap-2">
              <UCalendar
                v-model="dateRange"
                range
                :number-of-months="2"
                :is-date-unavailable="
                  (date: DateValue) =>
                    date.compare(today(getLocalTimeZone())) > 0
                "
              />
              <UButton
                block
                size="xs"
                color="neutral"
                variant="ghost"
                label="Clear"
                :disabled="!hasDateRange"
                @click="clearDateRange"
              />
            </div>
          </template>
        </UPopover>
        <UTooltip
          text="Placeholder keys the editor creates for an unbound tag (__draft_…). Uncheck to hide them. This is not the Draft status filter."
          :content="{ side: 'top' }"
        >
          <UCheckbox
            v-model="includeDraftKeys"
            label="Show __draft_ keys"
            class="items-center"
            :ui="{ label: 'text-xs whitespace-nowrap' }"
          />
        </UTooltip>
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
        v-if="selectedRows.length"
        class="shrink-0 flex flex-wrap items-center gap-3 rounded-xl border border-primary/40 bg-default px-4 py-3"
      >
        <span class="text-sm font-medium">
          {{ selectedRows.length }} selected
        </span>
        <span
          v-if="selectedDraftIds.length && selectedPublishedIds.length"
          class="text-xs text-muted"
        >
          {{ selectedDraftIds.length }} draft ·
          {{ selectedPublishedIds.length }} published
        </span>
        <div class="ml-auto flex flex-wrap items-center gap-2">
          <UButton
            color="neutral"
            variant="outline"
            icon="i-lucide:check-check"
            :loading="publishing"
            :disabled="selectedDraftIds.length === 0"
            @click="publishKeys(selectedDraftIds)"
          >
            Publish {{ selectedDraftIds.length || '' }}
          </UButton>
          <UButton
            color="neutral"
            variant="outline"
            icon="i-lucide:undo-2"
            :loading="publishing"
            :disabled="selectedPublishedIds.length === 0"
            @click="openBulkUnpublish"
          >
            Revert {{ selectedPublishedIds.length || '' }}
          </UButton>
          <UButton
            color="error"
            variant="outline"
            icon="i-lucide:trash-2"
            :disabled="selectedDraftIds.length === 0"
            @click="openBulkDelete"
          >
            Delete {{ selectedDraftIds.length || '' }}
          </UButton>
          <UButton
            color="neutral"
            variant="ghost"
            label="Clear"
            @click="rowSelection = {}"
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
    <TagRefsSlideover
      v-model:open="refsOpen"
      :project-id="curProject.id"
      :key-id="refsKeyId"
    />
  </div>
</template>
