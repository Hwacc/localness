<script setup lang="ts">
const { variant = 'default', ...props } = defineProps<{
  modelValue: string | undefined
  variant?: 'mini' | 'default'
}>()
const emit = defineEmits<{
  'update:modelValue': [value: string | undefined]
}>()

const color = ref(props.modelValue)
watch(
  () => props.modelValue,
  () => {
    color.value = props.modelValue
  }
)

const chipStyle = computed(() => {
  return {
    backgroundColor: color.value || '#000',
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
      <UColorPicker
        v-model="color"
        class="p-2"
        @update:model-value="(color) => emit('update:modelValue', color)"
      />
    </template>
  </UPopover>
</template>
