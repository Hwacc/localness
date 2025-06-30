<script setup lang="ts">
import TaskProvider from '~/providers/TaskProvider.vue'
</script>

<template>
  <div class="h-screen">
    <TaskProvider>
      <slot />
    </TaskProvider>
  </div>
</template>
