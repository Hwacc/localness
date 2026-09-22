<script setup lang="ts">
const props = defineProps<{
  loading?: boolean
  disabled?: boolean
}>()

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
        :name="loading ? 'i-lucide:loader-circle' : 'i-mdi:robot'"
        :class="loading ? 'animate-spin' : ''"
        size="16"
      />
      <span>AI</span>
    </div>
  </GradientButton>
</template>
