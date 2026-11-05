<script setup lang="ts" generic="T extends TabsItem">
import type { TabsItem } from '@nuxt/ui'
import { useMediaQuery } from '@vueuse/core'

/**
 * Tabs for settings dialogs: a side column from `sm`, so adding a tab never
 * squeezes the labels, and a minimum height there so the dialog stays still
 * between short tabs. A longer pane grows the dialog and the modal body
 * scrolls — the pane has no scroll of its own. Below `sm` the modal is
 * full-width and a side column would crowd the fields, so the tabs go back on
 * top.
 */
const {
  items,
  height = 'min-h-[min(34rem,65vh)]',
  unmountOnHide = true,
} = defineProps<{
  items: T[]
  /** Tailwind min-height class for the side layout; size it to the usual pane. */
  height?: string
  unmountOnHide?: boolean
}>()

const model = defineModel<string | number>()

defineSlots<Record<string, (props: { item: T; index: number }) => unknown>>()

const side = useMediaQuery('(min-width: 640px)')
</script>

<template>
  <!--
    The link variant draws its rail on the start side of the list; it moves
    to the end and runs the full height, so the one line both divides the
    columns and carries the active indicator.
  -->
  <UTabs
    v-model="model"
    :items="items"
    variant="link"
    :unmount-on-hide="unmountOnHide"
    :orientation="side ? 'vertical' : 'horizontal'"
    :ui="
      side
        ? {
            root: `items-stretch gap-6 ${height}`,
            list: 'w-40 shrink-0 ms-0 border-s-0 border-e',
            indicator: 'start-auto -end-px',
            trigger: 'w-full justify-start',
            content: 'min-w-0 flex-1 p-1',
          }
        : { list: 'overflow-x-auto', trigger: 'shrink-0' }
    "
  >
    <template v-for="(_, name) in $slots" #[name]="slotProps">
      <slot :name="name" v-bind="slotProps" />
    </template>
  </UTabs>
</template>
