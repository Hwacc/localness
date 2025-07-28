<script setup lang="ts">
const frameworks = [
  {
    name: 'Vue',
    value: 'vue',
    icon: 'i-logos:vue',
  },
  {
    name: 'React',
    value: 'react',
    icon: 'i-logos:react',
  },
]

const { modelValue } = defineProps<{ modelValue: 'vue' | 'react' }>()
const emit = defineEmits<{ 'update:modelValue': ['vue' | 'react'] }>()
</script>

<template>
  <UButtonGroup orientation="horizontal">
    <UButton
      v-for="framework in frameworks"
      :key="framework.value"
      :icon="framework.icon"
      :variant="modelValue === framework.value ? 'solid' : 'outline'"
      color="neutral"
      @click="() => emit('update:modelValue', framework.value as 'vue' | 'react')"
    >
      {{ framework.name }}
    </UButton>
  </UButtonGroup>
</template>
