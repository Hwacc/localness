<script setup lang="ts">
import type { SelectProps } from '@nuxt/ui'
import type { HTMLAttributes } from 'vue'

const lineItems = [
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
/* @vue-ignore */
interface Props extends SelectProps<typeof lineItems> {
  class?: HTMLAttributes['class']
}

const { class: propsClass, ...props } = defineProps<Props>() as Props
const emit = defineEmits<{
  'update:modelValue': [value: number]
}>()

console.log('props', props)
</script>

<template>
  <USelect
    :class="$cn('w-38', propsClass)"
    :items="lineItems"
    v-bind="props"
    @update:model-value="(l) => emit('update:modelValue', l)"
  >
    <template #default="{ modelValue: val }">
      <div class="flex items-center gap-2">
        <div
          class="w-20 bg-black"
          :style="{ height: `${lineItems.find((o: any) => o.value === val)!.value}px` }"
        />
        <div>{{ lineItems.find((o: any) => o.value === val)!.label }}</div>
      </div>
    </template>
    <template #item="{ item }">
      <div class="flex items-center gap-2">
        <div class="w-20 bg-black" :style="{ height: `${item.value}px` }" />
        <div>{{ item.label }}</div>
      </div>
    </template>
  </USelect>
</template>
