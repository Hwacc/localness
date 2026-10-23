<script setup lang="ts">
import {
  LOCALE_COVERAGE_HINT,
  LOCALE_COVERAGE_STATES,
} from '#shared/utils/coverage'
</script>

<template>
  <div class="flex flex-col gap-1.5">
    <div
      v-for="state in LOCALE_COVERAGE_STATES"
      :key="state"
      class="grid grid-cols-[5.5rem_1fr] items-center gap-2 text-xs"
    >
      <LocaleStateDot :state="state" show-text />
      <span class="text-muted">{{ LOCALE_COVERAGE_HINT[state] }}</span>
    </div>
  </div>
</template>
