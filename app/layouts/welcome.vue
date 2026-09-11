<script setup lang="ts">
import { WELCOME_TEXTS } from '#shared/constants'
</script>

<template>
  <div class="h-screen">
    <div class="relative size-full flex flex-col items-center justify-center">
      <AuroraBackground class="absolute inset-0 z-[-1]" />
      <img
        class="size-32 mb-4 select-none pointer-events-none"
        src="/logo-text.png"
        alt="Localness"
      >
      <MorphingText :texts="WELCOME_TEXTS" />
      <slot></slot>
    </div>
  </div>
</template>
