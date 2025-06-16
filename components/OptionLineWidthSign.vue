<script lang="ts" setup>
const props = defineProps<{ value: number; label: string }>()
</script>

<template>
  <div class="flex items-center gap-2">
    <div class="w-20 bg-black" :style="{ height: `${props.value}px` }" />
    <div>{{ props.label }}</div>
  </div>
</template>
