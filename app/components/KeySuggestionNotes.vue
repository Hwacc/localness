<script setup lang="ts">
import type { KeyViolation } from '#shared/utils/key-convention'
import {
  KEY_VIOLATION_TEXT,
  keyViolationErrors,
  keyViolationWarnings,
} from '#shared/utils/key-convention'

const props = defineProps<{
  suggestion: I18nKeySuggestion
  /** The selected candidate, when the project already has that key. */
  duplicate?: I18nKeyDuplicate | null
  /** The model echoed the source text back changed. */
  echoDiffers: boolean
}>()

const describe = (violations: KeyViolation[]) =>
  violations.map((one) => KEY_VIOLATION_TEXT[one]).join('; ')

const errors = computed(() => keyViolationErrors(props.suggestion.violations))
const warnings = computed(() =>
  keyViolationWarnings(props.suggestion.violations),
)
</script>

<template>
  <!--
    One component because both panel arrangements need these three, and the
    wording is the part that must not drift between them.
  -->
  <KeyDuplicateNote v-if="duplicate" :duplicate="duplicate" />
  <UAlert
    v-if="errors.length"
    color="error"
    variant="soft"
    icon="i-lucide:circle-x"
    title="Breaks the key convention"
    :description="describe(errors)"
  />
  <UAlert
    v-if="warnings.length"
    color="warning"
    variant="soft"
    icon="i-lucide:triangle-alert"
    title="Differs from the suggested key style"
    :description="describe(warnings)"
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
