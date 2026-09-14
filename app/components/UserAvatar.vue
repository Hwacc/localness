<script setup lang="ts">
import type { AvatarProps } from '@nuxt/ui'

/**
 * `UAvatar` for a Localness user. Two things it takes care of that a bare
 * `UAvatar` does not:
 *
 * - `avatar` may be an OSS key (uploaded) or an absolute URL (Atlassian hands
 *   us a Gravatar link). A raw key as `src` resolves against the current route
 *   and 404s, so it goes through `useOssImageUrl` first.
 * - `alt` is always set. `UAvatar` derives its initials from `alt` and renders a
 *   blank circle without one, which looks identical to a broken image.
 */
const {
  avatar = null,
  name = null,
  size = 'sm',
} = defineProps<{
  avatar?: string | null
  name?: string | null
  size?: AvatarProps['size']
}>()

const url = useOssImageUrl(() => avatar)
const label = computed(() => name?.trim() || 'User')
</script>

<template>
  <UAvatar :src="url || undefined" :alt="label" :size="size" />
</template>
