<script setup lang="tsx">
import type { Column } from '@tanstack/vue-table'
import type { TableColumn, TableRow } from '@nuxt/ui'
import { TRANSLATION_LANGUAGES } from '#shared/constants'
import { formatI18nKeyDisplay, resolveEditedKey } from '#shared/utils'
import {
  UBadge,
  UButton,
  UCheckbox,
  UIcon,
  UInput,
  UTooltip,
} from '#components'

/**
 * The translations grid and everything that lives inside a row: cell editing,
 * inline rename, pinning, paging. Row *actions* stay with the page, because it
 * owns the dialogs they open.
 */
const props = defineProps<{
  projectId: ID
  rows: II18nKeyRow[]
  loading: boolean
  total: number
  limit: number
  localeCodes: string[]
  /** The language a key's original text lives in; editing that cell edits the original. */
  sourceLocale: string
  releases: IProjectRelease[]
  publishing: boolean
  /** The row whose Git sync switch is in flight, so only it shows a spinner. */
  gitSyncBusyId: ID | null
  /**
   * Bumped by `useI18nKeyQuery` whenever a load lands. It is the only signal
   * that tells "the list was reloaded" apart from "a row was patched in place":
   * a rename reassigns the rows array too, so watching that is a different thing.
   */
  loadCount: number
}>()

const emit = defineEmits<{
  edit: [row: II18nKeyRow]
  delete: [row: II18nKeyRow]
  publish: [row: II18nKeyRow]
  unpublish: [row: II18nKeyRow]
  'toggle-git-sync': [row: II18nKeyRow]
  'row-updated': [row: II18nKeyRow]
}>()

/**
 * Pass-through: the page keeps its own copy, because the bulk bar derives six
 * things from it and six call sites clear it.
 */
const rowSelection = defineModel<Record<string, boolean>>('rowSelection', {
  required: true,
})
const page = defineModel<number>('page', { required: true })

const toast = useToast()
const table = useTemplateRef('table')

/** Nothing outside the table reads this, so it lives here rather than as a prop. */
const columnPinning = ref({
  left: ['select', 'key'],
  right: ['actions'],
})

const drafts = ref<Record<string, string>>({})
/**
 * Both are reset by the load watcher below, which runs `immediate` — so they
 * have to be declared before it or its first call throws in the temporal dead
 * zone. Nothing else here is order-sensitive.
 */
const editingKeyId = ref<ID | null>(null)
const keyDraft = ref('')

/*
 * The AI panel opens as an expanded row rather than a popover. A floating panel
 * anchored to a cell inside a scrolling table either drifts away from its row or
 * has to be closed the moment you scroll, and both read as broken; an expanded
 * row is *part of* the table, so it scrolls with it, cannot be clipped by it,
 * and needs no anchoring at all.
 */
const expanded = ref<Record<string, boolean>>({})
const askingId = ref<ID | null>(null)
const { suggestion: keySuggestion, generate: generateKey } =
  useI18nKeyGeneration()

/** One panel at a time: it spans the whole table, so a list of them is unreadable. */
async function askAi(row: II18nKeyRow) {
  const id = String(row.id)
  if (expanded.value[id]) {
    /*
     * A second click closes. Reopening asks again on purpose — an old answer may
     * be stale by then — while closing costs nothing, which is what matters when
     * one call can take 20 seconds.
     */
    expanded.value = {}
    return
  }
  askingId.value = row.id
  expanded.value = { [id]: true }
  try {
    await generateKey({
      projectId: props.projectId,
      sourceText: cellDraft(row, props.sourceLocale),
    })
  } finally {
    askingId.value = null
  }
}

function onPickSuggestion(row: II18nKeyRow, key: string) {
  // Land the name in the inline editor rather than writing it: the row's commit
  // is Enter or blur, and the name should be seen in place before it goes in.
  keyDraft.value = key
  editingKeyId.value = row.id
  expanded.value = {}
}

/** Discarding the panel is just closing it — the row keeps whatever it had. */
function closeSuggestion() {
  expanded.value = {}
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

function rebuildDrafts() {
  const next: Record<string, string> = {}
  for (const row of props.rows) {
    for (const code of props.localeCodes) {
      next[cellKey(row.id, code)] = draftOf(row, code)
    }
  }
  drafts.value = next
}

/**
 * Keyed on the load counter rather than on `rows`: a rename reassigns that
 * array without being a reload, and rebuilding on it would wipe a cell the user
 * is still typing in.
 */
watch(
  () => props.loadCount,
  () => {
    rebuildDrafts()
    // A reload can reorder rows, and the bare id would then match whatever
    // landed here.
    editingKeyId.value = null
  },
  { immediate: true },
)

/**
 * Cell edits save on blur without the caller awaiting them, so a publish right
 * after typing would race that save and copy the previous draft. The page has
 * to flush this before publishing; nothing else does.
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
  // Mutated in place, not reloaded: the page reads these back to keep the bulk
  // bar's counts live, and a reload would drop the row selection.
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
    `/api/projects/${props.projectId}/i18n-keys/${row.id}`,
    { method: 'PATCH', body: { key: next } },
  )
  if (!updated) return
  // The page swaps it into the list rather than reloading: a rename bumps
  // `updatedAt`, so a reload would re-sort the row away.
  emit('row-updated', updated)
}

const refsOpen = ref(false)
const refsKeyId = ref<ID | undefined>()

function openTagRefs(row: II18nKeyRow) {
  if (row.tagCount <= 0) return
  refsKeyId.value = row.id
  refsOpen.value = true
}

function localeMeta(code: string) {
  return TRANSLATION_LANGUAGES.find((l) => l.value === code)
}

function canPublish(row: II18nKeyRow) {
  return hasUnpublishedDraft(row.locales)
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
  return props.releases.filter((release) =>
    ids.some((id) => String(id) === String(release.id)),
  )
}

/**
 * One column per locale. Extracted from the list below so the source language can
 * also lead the languages: a key's original text *is* that language's text, and a
 * second column for it would be one value twice.
 */
function localeColumn(code: string): TableColumn<II18nKeyRow> {
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
}

/** The source language leads, the rest keep the project's own order. */
const otherLocaleCodes = computed(() =>
  props.localeCodes.filter((code) => code !== props.sourceLocale)
)

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
    size: 260,
    // Pinned: width must match `size` exactly (see the select column).
    meta: {
      class: {
        th: 'w-[260px] min-w-[260px] max-w-[260px]',
        td: 'w-[260px] min-w-[260px] max-w-[260px]',
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
          <code
            class="block truncate text-xs font-mono"
            title={original.key}
          >
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
            class="block min-w-0 truncate rounded px-1 -ml-1 text-xs font-mono cursor-text hover:bg-elevated"
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
          {/*
            Outside the inline editor on purpose: that input commits on blur, so
            anything opened from inside it would blur it, commit, and close.
          */}
          <UTooltip text="Name this key with AI">
            <UButton
              class="shrink-0 text-muted size-4 p-0 justify-center"
              variant="ghost"
              color="neutral"
              ui={{ leadingIcon: 'size-3' }}
              square
              icon="i-mdi:robot"
              loading={String(askingId.value) === String(original.id)}
              aria-label="Name this key with AI"
              onClick={() => askAi(original)}
            />
          </UTooltip>
        </div>
      )
    },
  },
  // The original text's own column, first among the languages and editable like
  // any other (editing it moves the key's text).
  localeColumn(props.sourceLocale),
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
  ...(props.releases.length
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
  ...otherLocaleCodes.value.map((code) => localeColumn(code)),
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
              loading={props.gitSyncBusyId === original.id}
              onClick={() => emit('toggle-git-sync', original)}
            />
          </UTooltip>
          <UTooltip text={isDraft ? 'Edit' : 'View'}>
            <UButton
              size="xs"
              variant="ghost"
              color="neutral"
              square
              icon={isDraft ? 'i-lucide:pencil' : 'i-lucide:eye'}
              onClick={() => emit('edit', original)}
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
                disabled={props.publishing || !canPublish(original)}
                onClick={() => emit('publish', original)}
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
                disabled={props.publishing}
                onClick={() => emit('unpublish', original)}
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
                onClick={() => emit('delete', original)}
              />
            </UTooltip>
          ) : null}
        </div>
      )
    },
  },
])

defineExpose({
  flushPendingSaves,
  /** For the page's column-visibility menu, which sits in the filter bar. */
  tableApi: computed(() => table.value?.tableApi),
})
</script>

<template>
  <div
    class="flex-1 min-h-0 min-w-0 rounded-xl border border-default bg-default overflow-hidden flex flex-col"
  >
    <div class="flex-1 min-h-0 min-w-0 overflow-hidden">
      <UTable
        ref="table"
        v-model:row-selection="rowSelection"
        v-model:column-pinning="columnPinning"
        v-model:expanded="expanded"
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
          td: 'px-4 py-2.5 align-middle bg-default',
        }"
      >
        <template #empty>
          <div class="py-12 text-center text-sm text-muted">
            {{
              validID(projectId)
                ? 'No keys yet. Create tags in the editor to populate this table.'
                : 'Select a project to manage translations.'
            }}
          </div>
        </template>
        <template #expanded="{ row }">
          <!-- Capped: the row spans every locale column, and a two-column panel
               stretched across 2000px is harder to read, not easier. -->
          <div class="w-fit pl-12">
            <AIKeySuggestion
              v-if="keySuggestion"
              layout="horizontal"
              :suggestion="keySuggestion"
              :source-text="cellDraft(row.original, props.sourceLocale)"
              @pick="onPickSuggestion(row.original, $event)"
              @cancel="closeSuggestion"
            />
            <p v-else class="text-xs text-muted">
              {{
                String(askingId) === String(row.original.id)
                  ? 'Thinking…'
                  : 'No suggestion — the reason is in the notification.'
              }}
            </p>
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
        v-model:page="page"
        :items-per-page="limit"
        :total="total"
      />
    </div>
    <!-- Teleports to <body>, so nesting it in the card costs no layout. -->
    <TagRefsSlideover
      v-model:open="refsOpen"
      :project-id="projectId"
      :key-id="refsKeyId"
    />
  </div>
</template>
