<script lang="ts">
export interface Props {
  url?: string | null
  disabled?: boolean
  deleteable?: boolean
  /**
   * Turns the preview into an avatar: renders `UAvatar`, which falls back to
   * the initials of this text when the image fails to load. Without it the
   * preview keeps the `v-oss-image` directive, whose error placeholder is a
   * remote image — fine for a screenshot, useless for an avatar on a network
   * that cannot reach it.
   */
  fallbackText?: string
}
export interface Emits {
  click: []
  delete: []
}
</script>

<script setup lang="ts">
import type { HTMLAttributes } from 'vue'
import { cn } from '#shared/utils'

const {
  url = '',
  disabled = false,
  deleteable = true,
  fallbackText = '',
  class: propsClass = '',
} = defineProps<
  Props & {
    class?: HTMLAttributes['class']
  }
>()
const emit = defineEmits<Emits>()

// Resolved only in avatar mode: the directive does its own resolving, and under
// the QINIU engine every resolve is an API call, so plain previews must not pay
// for a second one.
const avatarUrl = useOssImageUrl(() => (fallbackText ? url : null))

/**
 * A plain preview is sized by the intrinsic height of its `<img>`, so `size-full`
 * is enough. `UAvatar` has no intrinsic size — its `size-full` would resolve
 * `h-full` against an indefinite parent height and collapse to zero — so avatar
 * mode states the square itself, matching the dashed empty state in
 * `ImageUploader`.
 */
const rootClass = computed(() =>
  cn(
    'relative flex items-center justify-center group rounded-md',
    fallbackText ? 'w-full aspect-square' : 'size-full',
    propsClass
  )
)

function onClick() {
  if (disabled) return
  emit('click')
}
function onView(e: MouseEvent) {
  e.stopPropagation()
  if (!url) return
  window.open(url, '_blank')
}
function onDelete(e: MouseEvent) {
  e.stopPropagation()
  if (deleteable) {
    emit('delete')
  }
}
</script>

<template>
  <div :class="rootClass" @click="onClick">
    <UAvatar
      v-if="fallbackText"
      :src="avatarUrl || undefined"
      :alt="fallbackText"
      class="size-full rounded-md"
      :ui="{ fallback: 'text-4xl font-medium' }"
    />
    <img
      v-else
      v-oss-image="url"
      class="w-full max-h-112.5 object-scale-down"
      alt="Preview Image"
    />
    <div
      class="absolute z-1 inset-0 bg-muted/50 invisible flex gap-4 rounded-md items-center justify-center group-hover:visible"
    >
      <UTooltip :delay-duration="0" text="View Image">
        <UIcon
          class="size-6 hover:text-green-400"
          name="i-lucide:view"
          @click="onView"
        />
      </UTooltip>
      <UTooltip
        v-if="!disabled && deleteable"
        :delay-duration="0"
        text="Delete Image"
      >
        <UIcon
          class="size-6 hover:text-red-400"
          name="i-lucide:trash-2"
          @click="onDelete"
        />
      </UTooltip>
    </div>
  </div>
</template>
