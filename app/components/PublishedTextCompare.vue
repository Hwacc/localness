<script setup lang="ts">
/** What is still served for a language whose draft has moved away from it. */
defineProps<{
  text: string
  disabled?: boolean
}>()

const emit = defineEmits<{ revert: [] }>()
</script>

<template>
  <div
    class="flex items-start gap-2 rounded-md bg-muted px-2 py-1.5 text-xs text-muted"
  >
    <span class="shrink-0 py-0.5 font-medium">Published</span>
    <p class="min-w-0 flex-1 py-0.5 whitespace-pre-wrap break-words">
      {{ text }}
    </p>
    <UTooltip text="Discard the draft and go back to the published text">
      <UButton
        class="shrink-0"
        size="xs"
        color="neutral"
        variant="ghost"
        icon="i-lucide:undo-2"
        label="Revert"
        :disabled="disabled"
        @click="emit('revert')"
      />
    </UTooltip>
  </div>
</template>
