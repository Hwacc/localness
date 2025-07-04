<script setup lang="ts">
import { OCR_ENGINES } from '~/constants'

const { modelValue, ...props } = defineProps<{ modelValue: number }>()
const emit = defineEmits<{ 'update:modelValue': [value: number] }>()

const engines = computed(() => {
  return OCR_ENGINES
})
</script>

<template>
  <USelect
    :model-value="modelValue"
    v-bind="props"
    :items="engines"
    @update:model-value="(v) => emit('update:modelValue', v)"
  />
</template>
