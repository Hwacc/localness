<script setup lang="ts">
import { TRANSLATION_LANGUAGES } from '#shared/constants'

const props = defineProps<{ locale: string }>()

const icon = computed(
  () => TRANSLATION_LANGUAGES.find((lang) => lang.value === props.locale)?.icon,
)
</script>

<template>
  <UBadge color="neutral" variant="outline" size="sm" :icon="icon">
    {{ locale }}
  </UBadge>
</template>
