<script setup lang="ts">
import { formatI18nKeyDisplay } from '#shared/utils'
import type { IGitReviewItem } from '#shared/types/GitSync'

/**
 * The Git page's left pane: open conflicts when idle, pull candidates or push
 * keys during a review. Clicking a row focuses it; the checkbox selects it for
 * Apply. Rows that cannot be ticked still focus, so a conflict is resolved in
 * the detail pane.
 */
const props = defineProps<{
  items: IGitReviewItem[]
  selectedIds: string[]
  /** Idle mode lists conflicts only, so there is nothing to tick. */
  selectable: boolean
  headerChecked: boolean | 'indeterminate'
  emptyText: string
}>()

const emit = defineEmits<{
  toggle: [id: string, on: boolean | 'indeterminate']
  'toggle-all': [on: boolean | 'indeterminate']
}>()

const focused = defineModel<string | null>('focused', { required: true })

const canTickAny = computed(() => props.items.some((item) => item.selectable))

const listRef = useTemplateRef<HTMLDivElement>('list')

// Keyboard moves can leave the viewport; a click cannot, so `nearest` is a no-op then.
watch(focused, async (id) => {
  if (id == null) return
  await nextTick()
  listRef.value
    ?.querySelector(`[data-item-id="${CSS.escape(id)}"]`)
    ?.scrollIntoView({ block: 'nearest' })
})
</script>

<template>
  <div class="min-h-0 flex flex-col">
    <div
      class="shrink-0 flex items-center gap-3 px-4 py-2.5 bg-elevated/40 border-b border-default text-xs text-muted"
    >
      <UCheckbox
        v-if="selectable"
        :ui="{ base: 'bg-default' }"
        :model-value="headerChecked"
        :disabled="!canTickAny"
        aria-label="Select all visible"
        @update:model-value="emit('toggle-all', $event)"
      />
      <span class="inline-flex items-center gap-1">
        <UIcon name="i-lucide:list" class="size-3.5" />
        <span class="tabular-nums">{{ items.length }}</span>
        row{{ items.length === 1 ? '' : 's' }}
      </span>
    </div>

    <div
      ref="list"
      class="flex-1 min-h-0 overflow-auto flex flex-col gap-0.5 py-1"
      role="listbox"
    >
      <p
        v-if="!items.length"
        class="m-4 rounded-xl border border-dashed border-default px-4 py-6 text-center text-sm text-muted"
      >
        {{ emptyText }}
      </p>
      <div
        v-for="item in items"
        :key="item.id"
        :data-item-id="item.id"
        role="option"
        :aria-selected="item.id === focused"
        class="flex items-start gap-3 px-4 py-2 rounded-md border cursor-pointer transition-colors"
        :class="
          item.id === focused
            ? 'border-primary bg-primary/10'
            : 'border-transparent hover:bg-elevated/50'
        "
        @click="focused = item.id"
      >
        <UCheckbox
          v-if="selectable"
          class="mt-0.5"
          :ui="{ base: 'bg-default' }"
          :disabled="!item.selectable"
          :model-value="selectedIds.includes(item.id)"
          aria-label="Select row"
          @click.stop
          @update:model-value="emit('toggle', item.id, $event)"
        />
        <div class="min-w-0 flex-1 flex flex-col gap-1">
          <div class="flex items-center gap-2">
            <code
              class="min-w-0 truncate text-sm font-medium"
              :class="{ 'text-muted': selectable && !item.selectable }"
              :title="item.key"
            >
              {{ formatI18nKeyDisplay(item.key) }}
            </code>
            <LocaleBadge v-if="item.locale" class="shrink-0" :locale="item.locale" />
            <UBadge
              class="ml-auto shrink-0"
              variant="subtle"
              size="sm"
              :color="item.color"
            >
              {{ item.label }}
            </UBadge>
          </div>
          <div class="flex items-center gap-2">
            <p
              class="min-w-0 flex-1 truncate text-xs"
              :class="item.text ? 'text-muted' : 'text-dimmed italic'"
            >
              {{ item.text || 'Empty' }}
            </p>
            <UTooltip
              v-if="item.staleSource"
              text="Translated from an older source text"
            >
              <UIcon
                name="i-lucide:history"
                class="size-3.5 shrink-0 text-warning"
              />
            </UTooltip>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>
