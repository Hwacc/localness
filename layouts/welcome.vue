<script setup lang="ts">
import { WELCOME_TEXTS } from '~/constants'
</script>

<template>
  <div class="h-screen">
    <div class="relative size-full flex flex-col items-center justify-center">
      <AuroraBackground class="absolute inset-0 z-[-1]" />
      <MorphingText :texts="WELCOME_TEXTS" />
      <slot></slot>
    </div>
  </div>
</template>
