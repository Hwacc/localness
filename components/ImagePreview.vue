<script lang="ts">
export interface Props {
  url?: string | null
  disabled?: boolean
  deleteable?: boolean
}
export interface Emits {
  click: []
  delete: []
}
</script>

<script setup lang="ts">
// eslint-disable-next-line import/first
import type { HTMLAttributes } from 'vue'

const {
  url = '',
  disabled = false,
  deleteable = true,
  class: propsClass = '',
} = defineProps<
  Props & {
    class?: HTMLAttributes['class']
  }
>()
const emit = defineEmits<Emits>()

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
  <div
    :class="
      $cn(
        'relative flex items-center justify-center size-full group rounded-md',
        propsClass
      )
    "
    @click="onClick"
  >
    <img
      v-qiniu="url"
      class="w-full max-h-[28.125rem] object-scale-down"
      alt="Preview Image"
    />
    <div
      class="absolute z-1 inset-0 bg-gray-50/50 invisible flex gap-4 rounded-md items-center justify-center group-hover:visible"
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
