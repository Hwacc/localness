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
] as const

const { modelValue, size = 'md' } = defineProps<{
  modelValue: 'vue' | 'react'
  size?: 'xs' | 'sm' | 'md'
}>()
const emit = defineEmits<{ 'update:modelValue': ['vue' | 'react'] }>()
</script>

<template>
  <UFieldGroup orientation="horizontal">
    <UButton
      v-for="framework in frameworks"
      :key="framework.value"
      :icon="framework.icon"
      :size="size"
      :variant="modelValue === framework.value ? 'subtle' : 'ghost'"
      :color="modelValue === framework.value ? 'primary' : 'neutral'"
      @click="() => emit('update:modelValue', framework.value)"
    >
      {{ framework.name }}
    </UButton>
  </UFieldGroup>
</template>
