<script setup lang="ts">
const props = defineProps<{ duplicate: I18nKeyDuplicate }>()

/**
 * Same text means the entry is already there; a different one means the name is
 * taken. The wording states only that much: what saving does with it differs by
 * surface (a tag links to the entry, an entry create or rename is refused), and
 * promising an action here would be wrong in two of the three places.
 */
const reuse = computed(() => props.duplicate.sameSourceText)
</script>

<template>
  <UAlert
    :color="reuse ? 'neutral' : 'warning'"
    variant="soft"
    :icon="reuse ? 'i-lucide:link' : 'i-lucide:triangle-alert'"
    :title="reuse ? 'Already in this project' : 'This key is taken'"
    :description="
      reuse
        ? `This project already has an entry for “${duplicate.sourceText}”.`
        : `“${duplicate.key}” already belongs to a different text: “${duplicate.sourceText}”`
    "
  />
</template>
