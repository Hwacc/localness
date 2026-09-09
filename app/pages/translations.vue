<script setup lang="tsx">
import type { DropdownMenuItem, TableColumn, TableRow } from '@nuxt/ui'
import type { Column } from '@tanstack/vue-table'
import {
  DEFAULT_LOCALES,
  TRANSLATION_LANGUAGES,
} from '#shared/constants'
import { formatI18nKeyDisplay } from '#shared/utils'
import { UBadge, UButton, UCheckbox, UIcon, UInput, UTooltip, AlertModal, I18nKeyModal } from '#components'
import { useDebounceFn } from '@vueuse/core'

definePageMeta({
  middleware: ['protected'],
  ssr: false,
})

const projectStore = useProjectStore()
const pageStore = usePageStore()
const { curProject } = storeToRefs(projectStore)
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

const dirtyCount = computed(() => rows.value.filter((r) => r.dirty).length)

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
  },
  {
    id: 'key',
    accessorKey: 'key',
    header: ({ column }) => pinHeader(column, 'Key'),
    enableHiding: false,
    size: 200,
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
      <UBadge
        variant="subtle"
        color="neutral"
        class={row.original.tagCount > 0 ? 'cursor-pointer' : 'opacity-50'}
        onClick={() => openTagRefs(row.original)}
      >
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
      class="shrink-0 px-6 py-5 bg-default border-b border-default flex items-start justify-between gap-6"
    >
      <div class="min-w-0">
        <h1 class="text-xl font-semibold tracking-tight">Translations</h1>
        <p class="mt-1 text-sm text-muted">
          {{
            validID(curProject.id)
              ? `Project: ${curProject.name}`
              : 'Select a project from the sidebar workspace switcher.'
          }}
        </p>
      </div>
      <div class="flex items-center gap-2 shrink-0">
        <UButton
          color="neutral"
          variant="outline"
          label="New translation"
          icon="i-lucide:plus"
          :disabled="!validID(curProject.id)"
          @click="openCreate"
        />
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
        <UBadge
          v-if="validID(curProject.id)"
          color="neutral"
          variant="subtle"
        >
          {{ curProject.name }}
        </UBadge>
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
    <TagRefsSlideover
      v-model:open="refsOpen"
      :project-id="curProject.id"
      :key-id="refsKeyId"
    />
  </div>
</template>
