<template>
  <span :class="$cn('inline-block px-1 pb-1', props.class)">
    <slot />
  </span>
</template>

<script setup lang="ts">
import type { HTMLAttributes } from 'vue'

interface Props {
  delay?: number
  duration?: number
  class?: HTMLAttributes['class']
  textEndColor?: string
}

const props = withDefaults(defineProps<Props>(), {
  class: '',
  delay: 0,
  duration: 1000,
  textEndColor: 'inherit',
})

const delayMs = computed(() => `${props.delay}ms`)
const durationMs = computed(() => `${props.duration}ms`)
</script>

<style scoped>
@keyframes background-expand {
  0% {
    background-size: 0% 100%;
  }
  100% {
    background-size: 100% 100%;
  }
}

@keyframes text-color-change {
  0% {
    color: inherit;
  }
  100% {
    color: v-bind(textEndColor);
  }
}

span {
  background-size: 0% 100%;
  background-repeat: no-repeat;
  background-position: left center;
  animation: background-expand v-bind(durationMs)
      cubic-bezier(0.68, -0.55, 0.265, 1.55) v-bind(delayMs) forwards,
    text-color-change v-bind(durationMs) cubic-bezier(0.68, -0.55, 0.265, 1.55)
      v-bind(delayMs) forwards;
}
</style>
