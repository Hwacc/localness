<script setup lang="ts">
import {
  LOCALE_COVERAGE_LABEL,
  type LocaleCoverageState,
} from '#shared/utils/coverage'

/**
 * One language's state as a dot, optionally followed by its name in the same
 * colour. No native title: the dots sit inside hover popovers that already say
 * which language is which, and a title would cover them.
 */
const props = defineProps<{
  state: LocaleCoverageState
  showText?: boolean
}>()

const tone = computed(() => {
  switch (props.state) {
    case 'published':
      return { dot: 'bg-success', text: 'text-success' }
    case 'draft':
      return { dot: 'bg-info', text: 'text-info' }
    case 'outdated':
      return { dot: 'bg-warning', text: 'text-warning' }
    case 'missing':
      return { dot: 'ring-1 ring-inset ring-accented', text: 'text-muted' }
    default: {
      const _exhaustive: never = props.state
      throw new Error(`Unknown coverage state: ${String(_exhaustive)}`)
    }
  }
})

</script>

<template>
  <span class="inline-flex shrink-0 items-center gap-1.5">
    <span class="inline-block size-2 shrink-0 rounded-full" :class="tone.dot" />
    <span v-if="showText" class="text-xs" :class="tone.text">
      {{ LOCALE_COVERAGE_LABEL[state] }}
    </span>
  </span>
</template>
