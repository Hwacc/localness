<script setup lang="ts">
import { KEY_VIOLATION_TEXT } from '#shared/utils/key-convention'

defineProps<{
  suggestion: I18nKeySuggestion
  /** The selected candidate, when the project already has that key. */
  duplicate?: I18nKeyDuplicate | null
  /** The model echoed the source text back changed. */
  echoDiffers: boolean
}>()
</script>

<template>
  <!--
    One component because both panel arrangements need these three, and the
    wording is the part that must not drift between them.
  -->
  <KeyDuplicateNote v-if="duplicate" :duplicate="duplicate" />
  <UAlert
    v-if="suggestion.violations.length"
    color="warning"
    variant="soft"
    icon="i-lucide:triangle-alert"
    title="Does not match the key convention"
    :description="
      suggestion.violations.map((one) => KEY_VIOLATION_TEXT[one]).join('; ')
    "
  />
  <UAlert
    v-if="echoDiffers"
    color="warning"
    variant="soft"
    icon="i-lucide:triangle-alert"
    title="The model changed the source text"
    :description="suggestion.source"
  />
</template>
