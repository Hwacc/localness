<script setup lang="ts">
import type { HTMLAttributes } from 'vue'

const LineItems = [
  {
    label: '1px',
    value: 1,
  },
  {
    label: '2px',
    value: 2,
  },
  {
    label: '4px',
    value: 4,
  },
]

interface LineWidthSelectProps {
  class?: HTMLAttributes['class']
  lineColor?: string
}

const {
  class: propsClass = '',
  lineColor = '#000',
  ...props
} = defineProps<LineWidthSelectProps>() 

const emit = defineEmits<{
  'update:modelValue': [value: number]
}>()
</script>

<template>
  <USelect
    :class="$cn('w-38', propsClass)"
    :items="LineItems"
    v-bind="props"
    @update:model-value="(l) => emit('update:modelValue', l)"
  >
    <template #default="{ modelValue: val }">
      <div class="flex items-center gap-2 line-wrap">
        <div
          class="w-20 line"
          :style="{ 
            backgroundColor: lineColor,
            height: `${LineItems.find((o: any) => o.value === val)!.value}px` 
          }"
        />
        <div>{{ LineItems.find((o: any) => o.value === val)!.label }}</div>
      </div>
    </template>
    <template #item="{ item }">
      <div class="w-full flex items-center gap-2">
        <div
          class="w-full line"
          :style="{
            backgroundColor: lineColor,
            height: `${item.value}px`,
          }"
        />
        <div>{{ item.label }}</div>
      </div>
    </template>
  </USelect>
</template>
