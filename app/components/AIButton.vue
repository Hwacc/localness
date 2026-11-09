<script setup lang="ts">
const props = withDefaults(
  defineProps<{
    loading?: boolean
    disabled?: boolean
    label?: string
  }>(),
  { label: 'AI' }
)

const inactive = computed(() => Boolean(props.disabled || props.loading))

const rootClass = computed(
  () =>
    `[&>span]:font-bold [&>span]:h-7 text-highlighted ${
      inactive.value ? 'cursor-not-allowed opacity-50' : 'cursor-pointer'
    }`
)
</script>

<template>
  <GradientButton :class="rootClass" :disabled="inactive">
    <div class="flex items-center gap-2">
      <UIcon
        :name="loading ? 'i-lucide:loader-circle' : 'i-lucide:wand-sparkles'"
        :class="loading ? 'animate-spin' : ''"
        size="16"
      />
      <span>{{ label }}</span>
    </div>
  </GradientButton>
</template>
