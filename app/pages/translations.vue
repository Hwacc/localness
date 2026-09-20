<script setup lang="tsx">
import type { DropdownMenuItem, TableColumn, TableRow } from '@nuxt/ui'
import type { Column } from '@tanstack/vue-table'
import {
  DEFAULT_LOCALES,
  I18nKeyStatusFilter,
  TRANSLATION_LANGUAGES,
} from '#shared/constants'
import { formatI18nKeyDisplay, resolveEditedKey } from '#shared/utils'
import {
  UBadge,
  UButton,
  UCheckbox,
  UIcon,
  UInput,
  UTooltip,
  AlertModal,
  I18nKeyModal,
  TransferKeysModal,
} from '#components'
import { useDebounceFn, watchIgnorable } from '@vueuse/core'
import {
  getLocalTimeZone,
  parseDate,
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
const { curProject, curReleases, curReleaseFilter } = storeToRefs(projectStore)
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

const editingKeyId = ref<ID | null>(null)
const keyDraft = ref('')

/**
 * Filters `updatedAt`, the column the table is already sorted by. A `ref`, not
 * `reactive`: the range calendar replaces the whole object on every click, so
 * `v-model` needs something it can assign to. Left untyped because the
 * calendar's model type comes from reka-ui's own copy of
 * @internationalized/date, and naming any of our copies makes `v-model` a type
 * error. Restoring a stored range goes in through a cast at that one boundary.
 */
const dateRange = ref({ start: undefined, end: undefined })

/** The calendar writes its own `DateValue` into the untyped range above. */
function asDate(value: unknown) {
  return (value ?? undefined) as DateValue | undefined
}

const hasDateRange = computed(() =>
  Boolean(dateRange.value.start || dateRange.value.end),
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
const selectedRows = computed<II18nKeyRow[]>(() =>
  rows.value.filter((r) => rowSelection.value[String(r.id)]),
)
const selectedDraftIds = computed<number[]>(() =>
  selectedRows.value.filter((r) => r.dirty).map((r) => Number(r.id)),
)
/** Selected drafts the endpoint would actually change; the rest report zero. */
const selectedPublishableIds = computed<number[]>(() =>
  selectedRows.value
    .filter((r) => r.dirty && canPublish(r))
    .map((r) => Number(r.id)),
)
const selectedPublishedIds = computed<number[]>(() =>
  selectedRows.value.filter((r) => !r.dirty).map((r) => Number(r.id)),
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
  parseLocales(curProject.value.settings?.locales),
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
const transferModal = overlay.create(TransferKeysModal)

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

const bulkReleaseId = ref<number | undefined>(undefined)
const bulkReleasing = ref(false)

const bulkReleaseItems = computed(() =>
  curReleases.value.map((release) => ({
    label: release.name,
    value: Number(release.id),
  })),
)

// Defaults to the release being viewed, so tagging the obvious one is one click.
watch(
  () => curReleaseFilter.value,
  (value) => {
    bulkReleaseId.value = defaultReleaseIdForFilter(value)
  },
  { immediate: true },
)

/**
 * Ignores draft-vs-published: a label sits beside the copy, not on one side of
 * it, so one call covers the whole selection.
 */
async function setBulkRelease(mode: 'add' | 'remove') {
  const releaseId = bulkReleaseId.value
  if (!releaseId || !validID(curProject.value.id)) return
  const ids = selectedRows.value.map((row) => Number(row.id))
  if (!ids.length) return
  bulkReleasing.value = true
  try {
    await useApi(`/api/projects/${curProject.value.id}/release-membership`, {
      method: 'POST',
      body: { releaseId, kind: 'key', ids, mode },
    })
    toast.add({
      title: mode === 'add' ? 'Added to release' : 'Removed from release',
      color: 'success',
      icon: 'i-lucide:check',
    })
    rowSelection.value = {}
    await loadKeys()
  } finally {
    bulkReleasing.value = false
  }
}

/** Everything but the primary action, so the bar carries four controls instead of seven. */
const bulkMenuItems = computed<DropdownMenuItem[][]>(() => [
  [
    {
      label: 'Include in Git sync',
      icon: 'i-lucide:git-branch',
      disabled:
        !selectedRows.value.length ||
        gitSyncBulkPending.value ||
        bulkGitSyncState.value === 'on',
      onSelect: () => setBulkGitSync(true),
    },
    {
      label: 'Exclude from Git sync',
      icon: 'i-lucide:git-branch',
      disabled:
        !selectedRows.value.length ||
        gitSyncBulkPending.value ||
        bulkGitSyncState.value === 'off',
      onSelect: () => setBulkGitSync(false),
    },
  ],
  [
    {
      label: selectedRows.value.length
        ? `Copy ${selectedRows.value.length} to another project`
        : 'Copy to another project',
      icon: 'i-lucide:copy',
      disabled: !canTransfer.value || transferring.value,
      onSelect: () => openTransfer('copy'),
    },
    {
      label: selectedRows.value.length
        ? `Move ${selectedRows.value.length} to another project`
        : 'Move to another project',
      icon: 'i-lucide:folder-output',
      disabled: !canTransfer.value || transferring.value,
      onSelect: () => openTransfer('move'),
    },
  ],
  [
    {
      label: selectedPublishedIds.value.length
        ? `Revert ${selectedPublishedIds.value.length} published`
        : 'Revert published',
      icon: 'i-lucide:undo-2',
      disabled: !selectedPublishedIds.value.length || publishing.value,
      onSelect: () => openBulkUnpublish(),
    },
  ],
  [
    {
      label: selectedDraftIds.value.length
        ? `Delete ${selectedDraftIds.value.length} draft`
        : 'Delete draft',
      icon: 'i-lucide:trash-2',
      color: 'error',
      disabled: !selectedDraftIds.value.length,
      onSelect: () => openBulkDelete(),
    },
  ],
])

function openBulkDelete() {
  const targets = selectedRows.value.filter((r) => r.dirty)
  if (!targets.length) return
  const tagTotal = targets.reduce((sum, r) => sum + (r.tagCount ?? 0), 0)
  const tagHint =
    tagTotal > 0 ? ` This will also delete ${tagTotal} bound tag(s).` : ''
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
            useApi(`/api/translation/${row.id}`, { method: 'DELETE' }),
          ),
        )
        const failed = results.filter((r) => r.status === 'rejected').length
        const deletedIds = new Set(
          targets
            .filter((_, i) => results[i]!.status === 'fulfilled')
            .map((r) => String(r.id)),
        )
        pageStore.setTags(
          pageStore.tagList.filter((tag) => {
            const boundId = tag.translationID ?? tag.i18nKeyId
            return !deletedIds.has(String(boundId))
          }),
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

const transferring = ref(false)

/** The row whose Git sync switch is in flight, so only it shows a spinner. */
const gitSyncPending = ref<ID | null>(null)
const gitSyncBulkPending = ref(false)

/**
 * Patches the row in place rather than reloading: `loadKeys` clears the row
 * selection, and toggling sync is exactly the thing you do across several rows
 * in a row.
 */
async function setGitSync(row: II18nKeyRow, enabled: boolean) {
  gitSyncPending.value = row.id
  try {
    await useApi(
      `/api/projects/${curProject.value.id}/i18n-keys/${row.id}/git-sync`,
      { method: 'POST', body: { enabled } }
    )
    row.gitSyncEnabled = enabled
  } finally {
    gitSyncPending.value = null
  }
}

/**
 * What the selection already is, so the no-op half of the pair can be disabled
 * instead of quietly succeeding without changing anything.
 */
const bulkGitSyncState = computed<'on' | 'off' | 'mixed'>(() => {
  const rows = selectedRows.value
  if (!rows.length) return 'mixed'
  const on = rows.filter((row) => row.gitSyncEnabled).length
  if (on === rows.length) return 'on'
  return on === 0 ? 'off' : 'mixed'
})

async function setBulkGitSync(enabled: boolean) {
  const ids = selectedRows.value.map((row) => Number(row.id))
  if (!ids.length) return
  gitSyncBulkPending.value = true
  try {
    await useApi(`/api/projects/${curProject.value.id}/i18n-keys/git-sync`, {
      method: 'POST',
      body: { enabled, keyIds: ids },
    })
    toast.add({
      title: enabled ? 'Included in Git sync' : 'Kept out of Git sync',
      description: `${ids.length} translation(s) updated`,
      color: 'success',
      icon: 'i-lucide:check',
    })
    rowSelection.value = {}
    await loadKeys()
  } finally {
    gitSyncBulkPending.value = false
  }
}

/**
 * Destinations: every project the user can see except this one. `projectStore`
 * only holds projects from Teams they belong to, so this is the client half of
 * the server's 403, not a substitute for it.
 */
const transferableProjects = computed(() =>
  projectStore.projects
    .filter((project) => String(project.id) !== String(curProject.value.id))
    .map((project) => ({ label: project.name, value: Number(project.id) }))
)

/** A copy of a published key lands published, so the confirmation says so. */
const selectionHasPublished = computed(() =>
  selectedRows.value.some((row) => !row.dirty)
)

/** Both modes act on the whole selection — drafts and published alike. */
const canTransfer = computed(
  () =>
    Boolean(selectedRows.value.length) &&
    Boolean(transferableProjects.value.length)
)

function openTransfer(mode: 'copy' | 'move') {
  if (!canTransfer.value) return
  // Freeze the batch. `loadKeys()` clears the row selection, so re-reading it
  // inside the modal would let a filter or page change shrink the request
  // between opening this dialog and confirming it.
  const keyIds = selectedRows.value.map((row) => Number(row.id))
  transferModal.open({
    mode,
    keyIds,
    targetProjects: transferableProjects.value,
    sourceProjectName: curProject.value.name,
    hasPublished: selectionHasPublished.value,
    onOk: async ({ targetProjectId, close }) => {
      transferring.value = true
      transferModal.patch({ loading: true })
      try {
        const result = await useApi<II18nTransferResult>(
          `/api/projects/${curProject.value.id}/i18n-keys/transfer`,
          { method: 'POST', body: { mode, targetProjectId, keyIds } }
        )
        if (!result) return
        if (mode === 'move' && result.movedIds.length) {
          // Drop the binding but keep the box: a move relocates text, it does
          // not dismantle the screenshot. Leaving the binding would let the
          // next tag save post the old key name back and re-create it.
          const moved = new Set(result.movedIds.map(String))
          pageStore.setTags(
            pageStore.tagList.map((tag) => {
              const boundId = tag.translationID ?? tag.i18nKeyId
              if (boundId === undefined || !moved.has(String(boundId))) {
                return tag
              }
              return {
                ...tag,
                translationID: undefined,
                i18nKeyId: undefined,
                i18nKey: undefined,
              }
            })
          )
        }
        reportTransfer(result, mode)
        close()
        rowSelection.value = {}
        await loadKeys()
      } finally {
        transferring.value = false
        transferModal.patch({ loading: false })
      }
    },
  })
}

function reportTransfer(result: II18nTransferResult, mode: 'copy' | 'move') {
  const verb = mode === 'move' ? 'moved' : 'copied'
  const done = mode === 'move' ? result.removed : result.copied
  const target =
    transferableProjects.value.find(
      (project) => project.value === Number(result.targetProjectId)
    )?.label ?? 'the target project'

  if (!done) {
    toast.add({
      title: `Nothing ${verb}`,
      description: result.failed.length
        ? `${result.failed.length} key(s) could not be transferred.`
        : `Every selected key already exists in ${target}.`,
      color: 'warning',
      icon: 'i-lucide:triangle-alert',
    })
    return
  }

  const parts = [`${done} ${verb} to ${target}`]
  if (result.skipped.length) {
    const names = result.skipped.map((row) => formatI18nKeyDisplay(row.key))
    const named =
      names.length <= 3
        ? names.join(', ')
        : `${names.slice(0, 3).join(', ')} +${names.length - 3} more`
    parts.push(`${result.skipped.length} skipped, already there: ${named}`)
  }
  if (result.failed.length) parts.push(`${result.failed.length} failed`)

  const problems = result.skipped.length + result.failed.length
  toast.add({
    title: problems
      ? `Partially ${verb}`
      : verb.charAt(0).toUpperCase() + verb.slice(1),
    description: parts.join(', '),
    color: problems ? 'warning' : 'success',
    icon: problems ? 'i-lucide:triangle-alert' : 'i-lucide:check',
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
          }),
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
  position: 'left' | 'right' = 'left',
  hint?: string,
) {
  const isPinned = column.getIsPinned()
  return (
    <div class="flex items-center gap-1">
      <span>{label}</span>
      {hint ? (
        <UTooltip text={hint}>
          <UIcon
            name="i-lucide:info"
            class="size-3.5 shrink-0 cursor-help text-muted"
          />
        </UTooltip>
      ) : null}
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

/** Badges shown inline before the column collapses into a `+N`. */
const RELEASE_BADGE_LIMIT = 2

/** Rows carry label ids only, so the names come from the project's own order. */
function releaseLabelsOf(row: II18nKeyRow) {
  const ids = row.releaseIds ?? []
  if (!ids.length) return []
  return curReleases.value.filter((release) =>
    ids.some((id) => String(id) === String(release.id)),
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
    header: ({ column }) =>
      pinHeader(
        column,
        'Key',
        'left',
        'A draft key can still be renamed: click it, or use the pencil. A published key keeps its name — revert it to draft first.',
      ),
    enableHiding: false,
    size: 200,
    // Pinned: width must match `size` exactly (see the select column).
    meta: {
      class: {
        th: 'w-[200px] min-w-[200px] max-w-[200px]',
        td: 'w-[200px] min-w-[200px] max-w-[200px]',
      },
    },
    cell: ({ row }: { row: TableRow<II18nKeyRow> }) => {
      const original = row.original
      if (String(editingKeyId.value) === String(original.id)) {
        return (
          <UInput
            class="w-full"
            size="sm"
            autofocus
            modelValue={keyDraft.value}
            onUpdate:modelValue={(value: string | number) => {
              keyDraft.value = String(value ?? '')
            }}
            onKeydown={(event: KeyboardEvent) => {
              if (event.key === 'Enter') {
                event.preventDefault()
                commitKeyEdit(original)
              } else if (event.key === 'Escape') {
                event.preventDefault()
                editingKeyId.value = null
              }
            }}
            onBlur={() => commitKeyEdit(original)}
          />
        )
      }
      // Only a draft is offered the affordance, matching what the server allows.
      if (!original.dirty) {
        return (
          <code class="text-xs font-mono break-all" title={original.key}>
            {formatI18nKeyDisplay(original.key)}
          </code>
        )
      }
      /**
       * The pencil is always rendered, not hover-only: a draft key looked like
       * plain text, so nobody discovered it could be renamed.
       */
      return (
        <div class="flex items-start gap-1">
          <code
            class="min-w-0 rounded px-1 -ml-1 text-xs font-mono break-all cursor-text hover:bg-elevated"
            title={original.key}
            onClick={() => startKeyEdit(original)}
          >
            {formatI18nKeyDisplay(original.key)}
          </code>
          <UTooltip text="Rename this draft key">
            <UButton
              class="shrink-0 text-muted size-4 p-0 justify-center"
              variant="ghost"
              color="neutral"
              ui={{ leadingIcon: 'size-3' }}
              square
              icon="i-lucide:pencil"
              aria-label="Rename key"
              onClick={() => startKeyEdit(original)}
            />
          </UTooltip>
        </div>
      )
    },
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
  // Only when the project uses labels at all, so a project with none does not
  // get a column of dashes.
  ...(curReleases.value.length
    ? [
        {
          id: 'releases',
          header: ({ column }: { column: Column<II18nKeyRow, unknown> }) =>
            pinHeader(column, 'Releases'),
          size: 140,
          cell: ({ row }: { row: TableRow<II18nKeyRow> }) => {
            const labels = releaseLabelsOf(row.original)
            if (!labels.length) {
              return <span class="text-xs text-muted">—</span>
            }
            const overflow = labels.slice(RELEASE_BADGE_LIMIT)
            return (
              <div class="flex flex-wrap items-center gap-1">
                {labels.slice(0, RELEASE_BADGE_LIMIT).map((release) => (
                  <UBadge
                    key={release.id}
                    color="primary"
                    variant="subtle"
                    size="sm"
                  >
                    {release.name}
                  </UBadge>
                ))}
                {overflow.length ? (
                  <UTooltip
                    text={overflow.map((release) => release.name).join(', ')}
                  >
                    <UBadge color="neutral" variant="subtle" size="sm">
                      +{overflow.length}
                    </UBadge>
                  </UTooltip>
                ) : null}
              </div>
            )
          },
        },
      ]
    : []),
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
    size: 176,
    // Pinned right: `getAfter('right')` uses `size`, so the rendered width has
    // to match it (see the select column).
    meta: {
      class: {
        th: 'w-[176px] min-w-[176px] max-w-[176px]',
        td: 'w-[176px] min-w-[176px] max-w-[176px]',
      },
    },
    cell: ({ row }: { row: TableRow<II18nKeyRow> }) => {
      const original = row.original
      const isDraft = original.dirty
      return (
        <div class="flex items-center gap-0.5">
          {/* First, so it keeps one position: the buttons after it come and go
              with the key's status. */}
          <UTooltip
            text={
              original.gitSyncEnabled
                ? 'In Git sync — click to keep it out'
                : 'Kept out of Git sync — click to include it'
            }
          >
            <UButton
              size="xs"
              variant="ghost"
              color={original.gitSyncEnabled ? 'neutral' : 'error'}
              square
              icon="i-lucide:git-branch"
              loading={gitSyncPending.value === original.id}
              onClick={() => setGitSync(original, !original.gitSyncEnabled)}
            />
          </UTooltip>
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
            <UTooltip
              text={
                canPublish(original)
                  ? 'Publish'
                  : 'Nothing to publish — no draft text on this entry'
              }
            >
              <UButton
                size="xs"
                variant="ghost"
                color="neutral"
                square
                icon="i-lucide:upload"
                disabled={publishing.value || !canPublish(original)}
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
  // A reload can reorder rows, and the bare id would then match whatever landed here.
  editingKeyId.value = null
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
    // Release is a project-wide view filter, so it rides along with the rest.
    if (curReleaseFilter.value === 'unassigned') {
      params.set('unassigned', '1')
    } else if (typeof curReleaseFilter.value === 'number') {
      params.set('releaseId', String(curReleaseFilter.value))
    }
    // Whole local days, so a single picked day covers that day end to end.
    const start = asDate(dateRange.value.start)
    const end = asDate(dateRange.value.end)
    if (start) {
      params.set(
        'from',
        $dayjs(start.toDate(getLocalTimeZone())).startOf('day').toISOString(),
      )
    }
    if (end || start) {
      params.set(
        'to',
        $dayjs((end ?? start)!.toDate(getLocalTimeZone()))
          .endOf('day')
          .toISOString(),
      )
    }
    const res = await useApi<IPagination<II18nKeyRow[]>>(
      `/api/projects/${curProject.value.id}/i18n-keys?${params.toString()}`,
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

/**
 * Filters are remembered per project, so switching away and back restores what
 * this project looked like. `watchIgnorable` lets `restoreFilters` write all of
 * them without tripping these watchers — otherwise a single project switch would
 * fire three extra loads, and `loadKeys` has no ordering guard, so a slow one
 * landing last would show the wrong project's rows.
 */
const qWatch = watchIgnorable(q, () => {
  persistFilters()
  searchDebounced()
})

// Status is a discrete choice, not typing — apply it immediately.
const statusWatch = watchIgnorable([statusFilter, includeDraftKeys], () => {
  persistFilters()
  page.value = 1
  loadKeys()
})

// Range calendars emit twice (start, then end). Reload on both so a single
// picked day filters right away instead of waiting for the second click.
const dateWatch = watchIgnorable(
  () => [dateRange.value.start, dateRange.value.end],
  () => {
    persistFilters()
    page.value = 1
    loadKeys()
  },
)

function persistFilters() {
  const start = asDate(dateRange.value.start)
  const end = asDate(dateRange.value.end)
  writeTranslationsFilterForProject(curProject.value.id, {
    q: q.value,
    status: statusFilter.value,
    includeDraftKeys: includeDraftKeys.value,
    from: start ? formatRangeDay(start) : undefined,
    to: end ? formatRangeDay(end) : undefined,
  })
}

function restoreFilters(projectId: ID) {
  const saved = readTranslationsFilterForProject(projectId)
  // These do not nest: each watcher counts changes to its own sources only.
  qWatch.ignoreUpdates(() => {
    q.value = saved.q
  })
  statusWatch.ignoreUpdates(() => {
    statusFilter.value = saved.status
    includeDraftKeys.value = saved.includeDraftKeys
  })
  dateWatch.ignoreUpdates(() => {
    // `parseDate` hands back our copy's `DateValue`; the calendar's model type
    // is reka-ui's copy — same shape, different type identity. Casting here is
    // the price of leaving the ref untyped above.
    dateRange.value = {
      start: saved.from ? parseDate(saved.from) : undefined,
      end: saved.to ? parseDate(saved.to) : undefined,
    } as typeof dateRange.value
  })
}

watch(
  () => curProject.value.id,
  (id) => {
    // The outgoing project is already saved — every filter change writes.
    restoreFilters(id)
    page.value = 1
    loadKeys()
  },
)

// The filter lives in the workspace bar, so this tab has to follow it.
watch(curReleaseFilter, () => {
  page.value = 1
  loadKeys()
})

/** The server's "changed only" clause skips a row whose drafts are all empty or already published. */
function canPublish(row: II18nKeyRow) {
  return row.locales.some(
    (locale) => (locale.draftText ?? '') !== (locale.publishedText ?? ''),
  )
}

/**
 * Cell edits save on blur without the caller awaiting them, so a publish right
 * after typing would race that save and copy the previous draft.
 */
const pendingSaves = new Set<Promise<unknown>>()

async function flushPendingSaves() {
  if (!pendingSaves.size) return
  await Promise.allSettled([...pendingSaves])
}

async function saveDraft(row: II18nKeyRow, locale: string, value: string) {
  if (!row.dirty) return
  const previous = draftOf(row, locale)
  if (previous === value) return
  const request = useApi(`/api/translation/${row.id}/vue`, {
    method: 'POST',
    body: { [locale]: value },
  })
  pendingSaves.add(request)
  try {
    await request
  } finally {
    pendingSaves.delete(request)
  }
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

/**
 * Drafts only: the server refuses to rename a published key, and a published
 * key's identity is what consumers and the Git batches look up.
 */
function startKeyEdit(row: II18nKeyRow) {
  if (!row.dirty) return
  editingKeyId.value = row.id
  keyDraft.value = formatI18nKeyDisplay(row.key)
}

async function commitKeyEdit(row: II18nKeyRow) {
  // Enter commits and unmounts the input, which blurs it too; dropping the id
  // first makes that second call a no-op rather than a duplicate request.
  if (String(editingKeyId.value) !== String(row.id)) return
  editingKeyId.value = null
  const next = resolveEditedKey(row.key, keyDraft.value)
  if (next === null || next === row.key) return
  if (!next) {
    toast.add({
      title: 'Key is required',
      color: 'error',
      icon: 'i-lucide:circle-alert',
    })
    return
  }
  const updated = await useApi<II18nKeyRow>(
    `/api/projects/${curProject.value.id}/i18n-keys/${row.id}`,
    { method: 'PATCH', body: { key: next } },
  )
  if (!updated) return
  // In place: a rename bumps `updatedAt`, so reloading would re-sort the row away.
  rows.value = rows.value.map((candidate) =>
    String(candidate.id) === String(updated.id) ? updated : candidate,
  )
}

// Always scoped to explicit keys. The endpoint also accepts an empty body to
// publish the whole project, but no UI offers that — bulk actions cover it.
async function publishKeys(keyIds: number[]) {
  if (!validID(curProject.value.id) || keyIds.length === 0) return
  publishing.value = true
  try {
    await flushPendingSaves()
    const res = await useApi<{ updated: number }>(
      `/api/projects/${curProject.value.id}/publish`,
      {
        method: 'POST',
        body: { keyIds },
      },
    )
    // `useApi` has already reported a failed request.
    if (!res) return
    if (res.updated === 0) {
      /*
       * The server only touches rows whose draft differs from what is published,
       * so zero is a real answer for a key with no draft text (or none at all).
       * Reporting that as success is what made this look like a publish that
       * quietly did nothing.
       */
      toast.add({
        title: 'Nothing to publish',
        description:
          'No draft text on the selected rows differs from what is already published.',
        color: 'warning',
        icon: 'i-lucide:circle-alert',
      })
    } else {
      toast.add({
        title: 'Published',
        description: `${res.updated} locale row(s) published`,
        color: 'success',
        icon: 'i-lucide:check',
      })
    }
    await loadKeys()
  } finally {
    publishing.value = false
  }
}

async function unpublishKeys(keyIds: number[]) {
  if (!validID(curProject.value.id) || keyIds.length === 0) return
  publishing.value = true
  try {
    await flushPendingSaves()
    const res = await useApi<{ updated: number }>(
      `/api/projects/${curProject.value.id}/unpublish`,
      {
        method: 'POST',
        body: { keyIds },
      },
    )
    if (!res) return
    if (res.updated === 0) {
      toast.add({
        title: 'Nothing to revert',
        description: 'The selected rows have no published text to withdraw.',
        color: 'warning',
        icon: 'i-lucide:circle-alert',
      })
    } else {
      toast.add({
        title: 'Reverted to draft',
        description: `${res.updated} locale row(s) unpublished`,
        color: 'success',
        icon: 'i-lucide:undo-2',
      })
    }
    await loadKeys()
  } finally {
    publishing.value = false
  }
}

onMounted(async () => {
  if (loggedIn.value && projectStore.projects.length === 0) {
    await projectStore.getProjects()
  }
  // Before the first load, so a reload keeps this project's filters too.
  restoreFilters(curProject.value.id)
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
        <div class="min-w-0">
          <p class="text-sm font-medium">{{ selectedRows.length }} selected</p>
          <p
            v-if="selectedDraftIds.length && selectedPublishedIds.length"
            class="text-xs text-muted"
          >
            {{ selectedDraftIds.length }} draft ·
            {{ selectedPublishedIds.length }} published
          </p>
        </div>
        <div class="ml-auto flex flex-wrap items-center justify-end gap-2">
          <!-- The one action a selection usually leads to. -->
          <UTooltip
            :text="
              selectedPublishableIds.length
                ? 'Publish the selected drafts'
                : 'Nothing to publish — no draft text differs from what is published'
            "
          >
            <UButton
              color="primary"
              icon="i-lucide:check-check"
              :loading="publishing"
              :disabled="selectedPublishableIds.length === 0"
              @click="publishKeys(selectedPublishableIds)"
            >
              Publish {{ selectedPublishableIds.length || '' }}
            </UButton>
          </UTooltip>
          <!-- One popover rather than the select + add + remove it replaced. -->
          <UPopover v-if="curReleases.length">
            <UButton
              color="neutral"
              variant="outline"
              icon="i-lucide:tag"
              :loading="bulkReleasing"
            >
              Release
            </UButton>
            <template #content>
              <div class="w-64 p-3 flex flex-col gap-3">
                <p class="text-sm font-medium">Release labels</p>
                <USelectMenu
                  v-model="bulkReleaseId"
                  class="w-full"
                  :items="bulkReleaseItems"
                  value-key="value"
                  placeholder="Pick a release"
                />
                <div class="flex items-center gap-2">
                  <UButton
                    class="flex-1 justify-center"
                    size="xs"
                    icon="i-lucide:tag"
                    label="Add"
                    :loading="bulkReleasing"
                    :disabled="!bulkReleaseId"
                    @click="setBulkRelease('add')"
                  />
                  <UButton
                    class="flex-1"
                    size="xs"
                    color="neutral"
                    variant="outline"
                    icon="i-lucide:tag-off"
                    label="Remove"
                    :disabled="!bulkReleaseId || bulkReleasing"
                    @click="setBulkRelease('remove')"
                  />
                </div>
                <p class="text-xs text-muted">
                  Applies to all {{ selectedRows.length }} selected.
                </p>
              </div>
            </template>
          </UPopover>
          <UDropdownMenu :items="bulkMenuItems">
            <UButton
              color="neutral"
              variant="outline"
              icon="i-lucide:ellipsis"
              square
              aria-label="More actions"
            />
          </UDropdownMenu>
          <UTooltip text="Clear selection">
            <UButton
              color="neutral"
              variant="ghost"
              icon="i-lucide:x"
              square
              aria-label="Clear selection"
              @click="rowSelection = {}"
            />
          </UTooltip>
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
