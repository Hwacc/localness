<script setup lang="ts">
import type { IStroke } from 'leafer-ui'
import { DEFAULT_LINE_COLOR } from '~/constants'

const { variant = 'default', ...props } = defineProps<{
  modelValue: IStroke | undefined
  variant?: 'mini' | 'default'
}>()
const emit = defineEmits<{
  'update:modelValue': [value: IStroke | undefined]
}>()

const color = computed({
  get: () => {
    if (typeof props.modelValue === 'string') {
      return props.modelValue
    } else {
      //TODO: if modelValue is IGradientPaint or IImagePaint make it to string or deal with it
      return DEFAULT_LINE_COLOR
    }
  },
  set: (val) => {
    // TODO: maybe support string to IGradientPaint or IImagePaint
    emit('update:modelValue', val)
  },
})

const chipStyle = computed(() => {
  return {
    backgroundColor: color.value || DEFAULT_LINE_COLOR,
  }
})
const buttonLabel = computed(() => {
  return color.value ? color.value : 'Choose color'
})
</script>

<template>
  <UPopover>
    <UButton
      :label="variant === 'mini' ? undefined : buttonLabel"
      color="neutral"
      variant="outline"
      size="lg"
    >
      <template #leading>
        <span class="size-4 rounded-full" :style="chipStyle" />
      </template>
    </UButton>

    <template #content>
      <UColorPicker v-model="color" class="p-2" />
    </template>
  </UPopover>
</template>
