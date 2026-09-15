<script setup lang="ts">
import type { TableColumn } from '@nuxt/ui'
import {
  getLocalTimeZone,
  today,
  type DateValue,
} from '@internationalized/date'
import { I18nKeyStatusFilter } from '#shared/constants'
import { formatI18nKeyDisplay } from '#shared/utils'
import { useDebounceFn } from '@vueuse/core'

/**
 * Read-only key list with checkboxes. The export picker: filtering here is the
 * export's filtering, and the selection it produces is explicit key ids.
 */
const props = defineProps<{
  projectId: ID
  /** Page scope from step 1: keys tagged there, plus keys with no tag at all. */
  pageIds: number[]
  /** Release scope, so the list matches the release being viewed. */
  releaseFilter?: ReleaseFilterValue
}>()

const selected = defineModel<number[]>({ default: () => [] })

const { $dayjs } = useNuxtApp()
const pageIds = computed(() => props.pageIds)
const projectId = computed(() => props.projectId)
const releaseFilter = computed(() => props.releaseFilter ?? 'all')
const query = useI18nKeyQuery({ projectId, pageIds, releaseFilter, limit: 10 })
const {
  q,
  status,
  includeDraftKeys,
  dateRange,
  hasDateRange,
  page,
  total,
  rows,
  loading,
} = query

const statusItems = [
  { label: 'All statuses', value: I18nKeyStatusFilter.ALL },
  { label: 'Draft', value: I18nKeyStatusFilter.DRAFT },
  { label: 'Published', value: I18nKeyStatusFilter.PUBLISHED },
]

const columns: TableColumn<II18nKeyRow>[] = [
  { id: 'select', header: '', enableSorting: false },
  { id: 'key', accessorKey: 'key', header: 'Key' },
  { id: 'origin', accessorKey: 'origin', header: 'Origin' },
  { id: 'status', header: 'Status' },
  { id: 'tags', header: 'Tags' },
  { id: 'updatedAt', header: 'Updated' },
]

/** Export ships published copy, so a key with none produces no row at all. */
function hasPublished(row: II18nKeyRow) {
  return row.locales.some((locale) => (locale.publishedText ?? '') !== '')
}

/**
 * Tagged on a page picked in step 1, so its row carries a `pic`. Without a page
 * scope `tagCount` counts every page, which says nothing about this export.
 */
function isOnSelectedPages(row: II18nKeyRow) {
  return props.pageIds.length > 0 && row.tagCount > 0
}

const selectedSet = computed(() => new Set(selected.value))

function isSelected(row: II18nKeyRow) {
  return selectedSet.value.has(Number(row.id))
}

function setSelected(row: II18nKeyRow, on: unknown) {
  const id = Number(row.id)
  if (on === true) {
    if (!selectedSet.value.has(id)) selected.value = [...selected.value, id]
    return
  }
  selected.value = selected.value.filter((value) => value !== id)
}

/** Header checkbox covers the rows currently listed, nothing else. */
const headerChecked = computed<boolean | 'indeterminate'>(() => {
  if (!rows.value.length) return false
  const listed = rows.value.map((row) => Number(row.id))
  const n = listed.filter((id) => selectedSet.value.has(id)).length
  if (n === 0) return false
  return n === listed.length ? true : 'indeterminate'
})

function toggleListed(on: boolean) {
  const listed = rows.value.map((row) => Number(row.id))
  if (on) {
    selected.value = [...new Set([...selected.value, ...listed])]
    return
  }
  const drop = new Set(listed)
  selected.value = selected.value.filter((id) => !drop.has(id))
}

const selectingAll = ref(false)

async function selectAllMatching() {
  selectingAll.value = true
  try {
    const ids = await query.matchingIds()
    selected.value = [...new Set([...selected.value, ...ids])]
  } finally {
    selectingAll.value = false
  }
}

function clearSelection() {
  selected.value = []
}

function formatRangeDay(value: DateValue) {
  return $dayjs(value.toDate(getLocalTimeZone())).format('YYYY-MM-DD')
}

const dateRangeLabel = computed(() => {
  const start = dateRange.value.start as DateValue | undefined
  const end = dateRange.value.end as DateValue | undefined
  if (!start) return 'Updated: any time'
  if (!end) return formatRangeDay(start)
  return `${formatRangeDay(start)} / ${formatRangeDay(end)}`
})

function clearDateRange() {
  dateRange.value = { start: undefined, end: undefined }
}

const searchDebounced = useDebounceFn(() => query.reload(), 300)

watch(q, () => searchDebounced())
watch([status, includeDraftKeys], () => query.reload())
watch(
  () => [dateRange.value.start, dateRange.value.end],
  () => query.reload()
)
watch(() => props.pageIds, () => query.reload(), { deep: true })
watch(() => props.releaseFilter, () => query.reload())
watch(page, () => query.load())

onMounted(() => query.load())
</script>

<template>
  <div class="flex flex-col gap-3">
    <div class="flex flex-wrap items-center gap-2">
      <UInput
        v-model="q"
        class="w-56"
        size="sm"
        icon="i-lucide:search"
        placeholder="Search key or origin"
      />
      <USelect
        v-model="status"
        class="w-40"
        size="sm"
        value-key="value"
        :items="statusItems"
      />
      <UPopover>
        <UButton
          size="sm"
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
        text="Placeholder keys the editor creates for an unbound tag (__draft_…). They almost never have published text, so they stay hidden. This is not the Draft status filter."
        :content="{ side: 'top' }"
      >
        <UCheckbox
          v-model="includeDraftKeys"
          label="Show __draft_ keys"
          :ui="{ label: 'text-xs whitespace-nowrap' }"
        />
      </UTooltip>
    </div>

    <!-- Vertical scrolling only: cells are capped so nothing overflows
         sideways, otherwise the x-scrollbar hides at the bottom of the rows. -->
    <div class="rounded-lg border border-default overflow-y-auto max-h-80">
      <UTable
        sticky="header"
        class="w-full"
        :data="rows"
        :columns="columns"
        :loading="loading"
        :get-row-id="(row: II18nKeyRow) => String(row.id)"
        :ui="{ th: 'bg-default', td: 'align-middle bg-default' }"
      >
        <template #select-header>
          <UCheckbox
            :model-value="headerChecked"
            @update:model-value="toggleListed($event === true)"
          />
        </template>
        <template #select-cell="{ row }">
          <UCheckbox
            :model-value="isSelected(row.original)"
            @update:model-value="setSelected(row.original, $event)"
          />
        </template>
        <template #key-cell="{ row }">
          <div class="flex items-center gap-1.5">
            <code
              class="max-w-56 truncate text-xs font-mono"
              :title="row.original.key"
            >
              {{ formatI18nKeyDisplay(row.original.key) }}
            </code>
            <!-- Scoped tagCount: with pageIds set, it only counts tags on the
                 pages picked in step 1. -->
            <UBadge
              v-if="isOnSelectedPages(row.original)"
              variant="subtle"
              color="primary"
              size="sm"
              class="shrink-0"
              :title="`Tagged on ${row.original.tagCount} of the selected page image(s)`"
            >
              In selected img
            </UBadge>
          </div>
        </template>
        <template #origin-cell="{ row }">
          <p
            class="max-w-64 truncate text-sm text-muted"
            :title="row.original.origin"
          >
            {{ row.original.origin || '—' }}
          </p>
        </template>
        <template #status-cell="{ row }">
          <div class="flex items-center gap-1">
            <UBadge
              variant="subtle"
              :color="row.original.dirty ? 'neutral' : 'success'"
            >
              {{ row.original.dirty ? 'Draft' : 'Published' }}
            </UBadge>
            <UBadge
              v-if="!hasPublished(row.original)"
              variant="subtle"
              color="warning"
              title="Export ships published text, so this key produces no row"
            >
              No published text
            </UBadge>
          </div>
        </template>
        <template #tags-cell="{ row }">
          <span class="text-sm text-muted">{{ row.original.tagCount }}</span>
        </template>
        <template #updatedAt-cell="{ row }">
          <span class="text-xs text-muted">
            {{ $dayjs(row.original.updatedAt).format('YYYY-MM-DD HH:mm') }}
          </span>
        </template>
        <template #empty>
          <div class="py-8 text-center text-sm text-muted">
            No keys match these filters.
          </div>
        </template>
      </UTable>
    </div>

    <div class="flex flex-wrap items-center gap-2">
      <span class="text-xs text-muted">
        {{ selected.length }} of {{ total }} key(s) selected
      </span>
      <UButton
        size="xs"
        color="neutral"
        variant="ghost"
        :loading="selectingAll"
        :disabled="!total"
        :label="`Select all ${total} matching`"
        @click="selectAllMatching"
      />
      <UButton
        size="xs"
        color="neutral"
        variant="ghost"
        label="Clear selection"
        :disabled="!selected.length"
        @click="clearSelection"
      />
      <UPagination
        v-model:page="page"
        class="ml-auto"
        size="xs"
        :items-per-page="query.limit"
        :total="total"
      />
    </div>
  </div>
</template>
