<script setup lang="ts">
import { OCR_LANGUAGES } from '#shared/constants'

const { modelValue, ...props } = defineProps<{ modelValue: string }>()
const emit = defineEmits<{ 'update:modelValue': [value: string] }>()

const languages = computed(() => {
  return OCR_LANGUAGES
})
</script>

<template>
  <USelect
    :model-value="modelValue"
    v-bind="props"
    :items="languages"
    @update:model-value="(v) => emit('update:modelValue', v)"
  />
</template>
