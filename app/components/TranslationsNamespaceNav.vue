<script setup lang="ts">
import { useElementSize } from '@vueuse/core'
import { DRAFT_KEY_PREFIX } from '#shared/utils'

/**
 * Namespace tabs on top of the Translations key list: All plus as many
 * namespaces as fit, the selected one always among them. The menu at the end
 * lists everything with counts — Ungrouped included — and carries the owner's
 * suggestions and the way into settings, so the strip costs the page no width.
 */
const props = defineProps<{
  namespaces: IKeyNamespace[]
  counts: I18nKeyRailCounts | null
  /** A Project Owner can declare suggestions and open the settings tab. */
  canManage: boolean
  adding: boolean
}>()

const selected = defineModel<NamespaceFilterValue>({ required: true })

const emit = defineEmits<{
  manage: []
  add: [name: string]
}>()

type Item = {
  value: NamespaceFilterValue
  label: string
  icon: string
  count: number | undefined
  mono: boolean
  /** Shown on hover instead of the label. */
  hint?: string
}

const allItem = computed<Item>(() => ({
  value: 'all',
  label: 'All',
  icon: 'i-lucide:layers',
  count: props.counts?.total,
  mono: false,
}))

const namespaceItems = computed<Item[]>(() =>
  props.namespaces.map((ns) => ({
    value: Number(ns.id),
    label: ns.name,
    icon: 'i-lucide:folder',
    count: props.counts?.byId[String(ns.id)],
    mono: true,
  }))
)

const ungroupedItem = computed<Item>(() => ({
  value: 'ungrouped',
  label: 'Ungrouped',
  icon: 'i-lucide:folder-open-dot',
  count: props.counts?.ungrouped,
  mono: false,
}))

/**
 * A fixed system group, not a namespace: the placeholder keys the editor makes
 * for an unbound tag. Shown while it has keys, or while it is the selection so
 * renaming the last one does not pull the tab from under the user.
 */
const unnamedItem = computed<Item | null>(() =>
  props.counts?.unnamed || selected.value === 'unnamed'
    ? {
        value: 'unnamed',
        label: 'Unnamed',
        icon: 'i-lucide:file-question',
        count: props.counts?.unnamed,
        mono: false,
        hint: `Placeholder keys (${DRAFT_KEY_PREFIX}…) the editor made for tags without a name yet. Rename one and it leaves this group.`,
      }
    : null
)

const menuItems = computed(() => [
  allItem.value,
  ...namespaceItems.value,
  ungroupedItem.value,
  ...(unnamedItem.value ? [unnamedItem.value] : []),
])

const strip = ref<HTMLElement | null>(null)
const measurer = ref<HTMLElement | null>(null)
const { width } = useElementSize(strip)

/**
 * Real pixel widths, read from an invisible copy of every tab (and the menu
 * button at its widest label) so fitting matches the font instead of a guess.
 */
const tabWidths = ref(new Map<NamespaceFilterValue, number>())
const menuWidth = ref(0)
// `gap-0.5` between tabs.
const GAP = 2

function measure() {
  const root = measurer.value
  if (!root) return
  const next = new Map<NamespaceFilterValue, number>()
  for (const el of root.querySelectorAll<HTMLElement>('[data-tab]')) {
    const item = menuItems.value[Number(el.dataset.tab)]
    if (item) next.set(item.value, el.offsetWidth)
  }
  tabWidths.value = next
  menuWidth.value =
    root.querySelector<HTMLElement>('[data-menu]')?.offsetWidth ?? 0
}

watch(menuItems, () => nextTick(measure), { deep: true })
onMounted(measure)

function tabWidth(item: Item) {
  return (tabWidths.value.get(item.value) ?? 0) + GAP
}

const tabs = computed<Item[]>(() => {
  const chosen = menuItems.value.find((item) => item.value === selected.value)
  // Unmeasured, show every namespace; the next frame trims to what fits.
  let budget = width.value
    ? width.value - menuWidth.value - tabWidth(allItem.value)
    : Infinity
  const pinned = chosen && chosen.value !== 'all' ? chosen : null
  if (pinned) budget -= tabWidth(pinned)

  const shown = new Set<NamespaceFilterValue>(pinned ? [pinned.value] : [])
  // Unnamed is a to-do list rather than a folder, so it is kept in view first.
  const unnamed = unnamedItem.value
  if (unnamed && !shown.has(unnamed.value) && tabWidth(unnamed) <= budget) {
    budget -= tabWidth(unnamed)
    shown.add(unnamed.value)
  }
  for (const item of namespaceItems.value) {
    if (shown.has(item.value)) continue
    const cost = tabWidth(item)
    if (cost > budget) break
    budget -= cost
    shown.add(item.value)
  }
  // Declared order, then Ungrouped when it is the selection, then Unnamed.
  return [
    allItem.value,
    ...namespaceItems.value.filter((item) => shown.has(item.value)),
    ...(pinned?.value === 'ungrouped' ? [ungroupedItem.value] : []),
    ...(unnamed && shown.has(unnamed.value) ? [unnamed] : []),
  ]
})

const hiddenCount = computed(
  () => menuItems.value.length - tabs.value.length
)

const suggestions = computed(() =>
  props.canManage ? (props.counts?.suggestions ?? []) : []
)

const menuOpen = ref(false)

function pick(value: NamespaceFilterValue) {
  selected.value = value
  menuOpen.value = false
}
</script>

<template>
  <nav
    ref="strip"
    class="relative flex items-center gap-0.5 px-2 bg-default overflow-hidden"
    aria-label="Key namespaces"
  >
    <div
      ref="measurer"
      class="invisible absolute left-0 top-0 h-0 flex items-start overflow-hidden pointer-events-none"
      aria-hidden="true"
    >
      <span
        v-for="(item, index) in menuItems"
        :key="item.value"
        :data-tab="index"
        class="shrink-0 max-w-40 flex items-center gap-1.5 px-2 py-2 text-xs"
      >
        <span class="truncate" :class="{ 'font-mono': item.mono }">
          {{ item.label }}
        </span>
        <span
          v-if="item.count !== undefined"
          class="shrink-0 tabular-nums"
        >
          {{ item.count }}
        </span>
      </span>
      <span data-menu class="shrink-0">
        <UButton
          size="xs"
          variant="ghost"
          trailing-icon="i-lucide:chevron-down"
          tabindex="-1"
          :label="`+${menuItems.length}`"
        />
      </span>
    </div>
    <button
      v-for="item in tabs"
      :key="item.value"
      type="button"
      class="relative shrink-0 min-w-0 max-w-40 flex items-center gap-1.5 px-2 py-2 text-xs transition-colors"
      :class="
        selected === item.value
          ? 'text-primary after:absolute after:inset-x-1 after:bottom-0 after:h-0.5 after:rounded-full after:bg-primary'
          : 'text-muted hover:text-default'
      "
      :aria-current="selected === item.value ? 'true' : undefined"
      :title="item.hint ?? item.label"
      @click="selected = item.value"
    >
      <span class="truncate" :class="{ 'font-mono': item.mono }">
        {{ item.label }}
      </span>
      <span
        v-if="item.count !== undefined"
        class="shrink-0 tabular-nums opacity-70"
      >
        {{ item.count }}
      </span>
    </button>

    <UPopover v-model:open="menuOpen" :content="{ align: 'end' }">
      <UButton
        class="ml-auto shrink-0"
        size="xs"
        color="neutral"
        variant="ghost"
        trailing-icon="i-lucide:chevron-down"
        :label="hiddenCount ? `+${hiddenCount}` : undefined"
        aria-label="All namespaces"
      />
      <template #content>
        <div class="w-64 max-h-96 flex flex-col">
          <div class="min-h-0 overflow-auto p-1 flex flex-col gap-0.5">
            <button
              v-for="item in menuItems"
              :key="item.value"
              type="button"
              class="flex items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm transition-colors"
              :class="
                selected === item.value
                  ? 'bg-primary/10 text-primary'
                  : 'text-default hover:bg-elevated/60'
              "
              :title="item.hint"
              @click="pick(item.value)"
            >
              <UIcon :name="item.icon" class="size-4 shrink-0" />
              <span
                class="min-w-0 flex-1 truncate"
                :class="{ 'font-mono': item.mono }"
              >
                {{ item.label }}
              </span>
              <span
                v-if="item.count !== undefined"
                class="shrink-0 text-xs tabular-nums text-muted"
              >
                {{ item.count }}
              </span>
            </button>
          </div>

          <div
            v-if="canManage"
            class="shrink-0 border-t border-default p-2 flex flex-col gap-2"
          >
            <template v-if="suggestions.length">
              <p class="text-xs text-muted">
                Suggested from Ungrouped keys — adding one renames nothing.
              </p>
              <div class="flex flex-wrap gap-1">
                <UButton
                  v-for="suggestion in suggestions"
                  :key="suggestion.name"
                  size="xs"
                  color="neutral"
                  variant="outline"
                  icon="i-lucide:plus"
                  class="font-mono"
                  :disabled="adding"
                  @click="emit('add', suggestion.name)"
                >
                  {{ suggestion.name }}
                  <span class="text-muted tabular-nums">
                    {{ suggestion.count }}
                  </span>
                </UButton>
              </div>
            </template>
            <UButton
              size="xs"
              color="neutral"
              variant="ghost"
              icon="i-lucide:settings-2"
              label="Manage namespaces"
              @click="
                () => {
                  menuOpen = false
                  emit('manage')
                }
              "
            />
          </div>
        </div>
      </template>
    </UPopover>
  </nav>
</template>
