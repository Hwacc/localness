<script setup lang="ts">
import type { HighlightSegment } from '#shared/utils/consistency'

defineProps<{ segments: HighlightSegment[] }>()
</script>

<template>
  <span>
    <template v-for="(segment, i) in segments" :key="i">
      <mark
        v-if="segment.hit"
        class="rounded-sm bg-warning/25 text-highlighted px-0.5"
        >{{ segment.text }}</mark
      ><template v-else>{{ segment.text }}</template>
    </template>
  </span>
</template>
