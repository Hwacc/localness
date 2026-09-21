<script setup lang="ts">
const props = defineProps<{ duplicate: I18nKeyDuplicate }>()

/** Same text means the entry already exists; a different one means it is taken. */
const reuse = computed(() => props.duplicate.sameOrigin)
</script>

<template>
  <UAlert
    :color="reuse ? 'neutral' : 'warning'"
    variant="soft"
    :icon="reuse ? 'i-lucide:link' : 'i-lucide:triangle-alert'"
    :title="reuse ? 'Already in this project' : 'This key is taken'"
    :description="
      reuse
        ? `Saving links this tag to the existing entry for “${duplicate.origin}”.`
        : `“${duplicate.key}” already belongs to another text: “${duplicate.origin}”`
    "
  />
</template>
