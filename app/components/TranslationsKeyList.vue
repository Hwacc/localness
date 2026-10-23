<script setup lang="ts">
import { TRANSLATION_LANGUAGES } from '#shared/constants'
import { DRAFT_KEY_PREFIX, formatI18nKeyDisplay } from '#shared/utils'
import { localeCoverageState } from '#shared/utils/coverage'

/**
 * The Translations page's left pane: one key per row, read by its name and its
 * source text. Other languages are only dots — their text lives in the
 * inspector. Clicking a row focuses it; the checkbox selects it for bulk work.
 */
const props = defineProps<{
  projectId: ID
  rows: II18nKeyRow[]
  loading: boolean
  total: number
  limit: number
  localeCodes: string[]
  sourceLocale: string
}>()

const focused = defineModel<ID | null>('focused', { required: true })
const rowSelection = defineModel<Record<string, boolean>>('rowSelection', {
  required: true,
})
const page = defineModel<number>('page', { required: true })

const otherLocales = computed(() =>
  props.localeCodes
    .filter((code) => code !== props.sourceLocale)
    .map((code) => {
      const meta = TRANSLATION_LANGUAGES.find((lang) => lang.value === code)
      return {
        code,
        short: meta?.short || code,
        name: meta?.label || code,
        icon: meta?.icon,
      }
    }),
)

/** Per row, in the project's language order; read by the dots and their popover. */
function coverageOf(row: II18nKeyRow) {
  return otherLocales.value.map((locale) => ({
    ...locale,
    state: localeCoverageState(row, locale.code, props.sourceLocale),
    text:
      row.locales.find((item) => item.locale === locale.code)?.draftText ?? '',
  }))
}

const selectedOnPage = computed(
  () => props.rows.filter((row) => rowSelection.value[String(row.id)]).length,
)
const allSelected = computed<boolean | 'indeterminate'>(() => {
  if (!props.rows.length || !selectedOnPage.value) return false
  return selectedOnPage.value === props.rows.length ? true : 'indeterminate'
})

function toggleAll(value: boolean | 'indeterminate') {
  rowSelection.value = value
    ? Object.fromEntries(props.rows.map((row) => [String(row.id), true]))
    : {}
}

function toggleRow(row: II18nKeyRow, value: boolean | 'indeterminate') {
  const id = String(row.id)
  const rest = Object.fromEntries(
    Object.entries(rowSelection.value).filter(([key]) => key !== id),
  )
  rowSelection.value = value ? { ...rest, [id]: true } : rest
}

function sourceOf(row: II18nKeyRow) {
  return (
    row.locales.find((item) => item.locale === props.sourceLocale)?.draftText ??
    ''
  )
}

const listRef = useTemplateRef<HTMLDivElement>('list')

// Keyboard moves can leave the viewport; a click cannot, so `nearest` is a no-op then.
watch(focused, async (id) => {
  if (id == null) return
  await nextTick()
  listRef.value
    ?.querySelector(`[data-key-id="${String(id)}"]`)
    ?.scrollIntoView({ block: 'nearest' })
})
</script>

<template>
  <div class="min-h-0 flex flex-col">
    <!-- Same summary strip as the Consistency list. -->
    <div
      class="shrink-0 flex items-center gap-3 px-4 py-2.5 bg-elevated/40 border-b border-default text-xs text-muted"
    >
      <UCheckbox
        :ui="{ base: 'bg-default' }"
        :model-value="allSelected"
        :disabled="!rows.length"
        aria-label="Select all on this page"
        @update:model-value="toggleAll"
      />
      <span class="inline-flex items-center gap-1">
        <UIcon name="i-lucide:key-round" class="size-3.5" />
        <span class="tabular-nums">{{ total }}</span>
        key{{ total === 1 ? '' : 's' }}
      </span>
      <span v-if="sourceLocale" class="inline-flex items-center gap-1">
        <UIcon name="i-lucide:languages" class="size-3.5" />
        <span class="uppercase">{{ sourceLocale }}</span>
        source
      </span>
      <UPopover mode="hover" :open-delay="150" :content="{ align: 'end' }">
        <UButton
          class="ml-auto"
          size="xs"
          color="neutral"
          variant="ghost"
          icon="i-lucide:info"
          label="Legend"
        />
        <template #content>
          <div class="w-80 p-3 flex flex-col gap-3">
            <p class="text-xs font-medium">
              One dot per language, in the project's order. Hover a row's dots
              to see which is which.
            </p>
            <LocaleStateLegend />
            <p class="border-t border-default pt-2 text-xs text-muted">
              <UKbd value="↑" /> <UKbd value="↓" /> move ·
              <UKbd value="X" /> select
            </p>
          </div>
        </template>
      </UPopover>
    </div>

    <div
      ref="list"
      class="flex-1 min-h-0 overflow-auto flex flex-col gap-0.5 py-1"
      role="listbox"
    >
      <p
        v-if="!rows.length"
        class="m-4 rounded-xl border border-dashed border-default px-4 py-6 text-center text-sm text-muted"
      >
        <template v-if="loading">Loading…</template>
        <template v-else-if="validID(projectId)">
          No keys match. Tag a screenshot in the editor, or create one with New
          translation.
        </template>
        <template v-else>Select a project to manage translations.</template>
      </p>
      <div
        v-for="row in rows"
        :key="row.id"
        :data-key-id="row.id"
        role="option"
        :aria-selected="String(row.id) === String(focused)"
        class="group flex items-start gap-3 px-4 py-2 rounded-md border cursor-pointer transition-colors"
        :class="
          String(row.id) === String(focused)
            ? 'border-primary bg-primary/10'
            : 'border-transparent hover:bg-elevated/50'
        "
        @click="focused = row.id"
      >
        <!-- Opaque, so an unticked box still reads on the focused row's tint. -->
        <UCheckbox
          class="mt-0.5"
          :ui="{ base: 'bg-default' }"
          :model-value="Boolean(rowSelection[String(row.id)])"
          aria-label="Select key"
          @click.stop
          @update:model-value="toggleRow(row, $event)"
        />
        <div class="min-w-0 flex-1 flex flex-col gap-1">
          <div class="flex items-center gap-2">
            <code
              class="min-w-0 truncate text-sm font-medium"
              :title="row.key"
            >
              {{ formatI18nKeyDisplay(row.key) }}
            </code>
            <UTooltip
              v-if="row.key.startsWith(DRAFT_KEY_PREFIX)"
              text="Placeholder name from the editor — give it a real one"
            >
              <UIcon
                name="i-lucide:sparkles"
                class="size-3 shrink-0 text-warning"
              />
            </UTooltip>
            <UBadge
              class="ml-auto shrink-0"
              :color="row.dirty ? 'warning' : 'success'"
              variant="subtle"
              size="sm"
            >
              {{ row.dirty ? 'Draft' : 'Published' }}
            </UBadge>
          </div>
          <div class="flex items-center gap-2">
            <p
              class="min-w-0 flex-1 truncate text-xs"
              :class="sourceOf(row) ? 'text-muted' : 'text-dimmed italic'"
            >
              {{ sourceOf(row) || 'No source text' }}
            </p>
            <!--
              Hover, not click: a click on the row focuses it, and the popover is
              a glance at which dot is which, with the text behind it.
            -->
            <UPopover
              v-if="otherLocales.length"
              mode="hover"
              :open-delay="200"
              :content="{ side: 'right', align: 'start', sideOffset: 12 }"
            >
              <div class="shrink-0 flex items-center gap-1 py-1">
                <LocaleStateDot
                  v-for="locale in coverageOf(row)"
                  :key="locale.code"
                  :state="locale.state"
                />
              </div>
              <template #content>
                <div class="w-80 p-2 flex flex-col">
                  <div
                    v-for="locale in coverageOf(row)"
                    :key="locale.code"
                    class="grid grid-cols-[4.5rem_5rem_1fr] items-center gap-2 rounded px-1.5 py-1 text-xs"
                  >
                    <span class="flex items-center gap-1.5 min-w-0">
                      <UIcon
                        v-if="locale.icon"
                        :name="locale.icon"
                        class="size-3.5 shrink-0"
                      />
                      <span class="truncate" :title="locale.name">
                        {{ locale.short }}
                      </span>
                    </span>
                    <LocaleStateDot :state="locale.state" show-text />
                    <span
                      class="truncate"
                      :class="locale.text ? 'text-default' : 'text-dimmed'"
                      :title="locale.text"
                    >
                      {{ locale.text || '—' }}
                    </span>
                  </div>
                </div>
              </template>
            </UPopover>
          </div>
        </div>
      </div>
    </div>

    <div
      v-if="total > limit"
      class="shrink-0 flex items-center justify-center px-4 py-2 bg-elevated/40 border-t border-default"
    >
      <UPagination
        v-model:page="page"
        size="xs"
        :items-per-page="limit"
        :total="total"
        :sibling-count="1"
      />
    </div>
  </div>
</template>
