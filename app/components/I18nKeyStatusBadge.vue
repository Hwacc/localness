<script setup lang="ts">
import { i18nKeyStatus } from '#shared/utils'

/**
 * Draft / Edited / Published for one key. Edited means published text is still
 * what export and delivery serve, with unpublished edits on top.
 */
const props = withDefaults(
  defineProps<{
    locales: Array<{ draftText: string | null; publishedText?: string | null }>
    size?: 'sm' | 'md'
    draftColor?: 'warning' | 'neutral'
  }>(),
  { size: 'sm', draftColor: 'warning' },
)

const status = computed(() => i18nKeyStatus(props.locales))
const view = computed(() => {
  switch (status.value) {
    case 'draft':
      return { label: 'Draft', color: props.draftColor, title: 'Never published' }
    case 'edited':
      return {
        label: 'Edited',
        color: 'info' as const,
        title: 'Published, with edits not yet published',
      }
    case 'published':
      return { label: 'Published', color: 'success' as const, title: undefined }
    default: {
      const _exhaustive: never = status.value
      throw new Error(`Unknown key status: ${String(_exhaustive)}`)
    }
  }
})
</script>

<template>
  <UBadge :color="view.color" variant="subtle" :size="size" :title="view.title">
    {{ view.label }}
  </UBadge>
</template>
