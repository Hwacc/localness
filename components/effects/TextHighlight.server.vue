<template>
  <span :class="'inline-block px-1 pb-1'">
    <slot />
  </span>
</template>

<script setup lang="ts">
import type { HTMLAttributes } from 'vue'
interface Props {
  class?: HTMLAttributes['class']
}
defineProps<Props>()
</script>
