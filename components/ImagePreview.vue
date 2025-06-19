<script lang="ts">
export interface Props {
  url?: string
  disabled?: boolean
  deleteable?: boolean
}
</script>

<script setup lang="ts">
const { url = '', disabled = false, deleteable = true } = defineProps<Props>()
const emit = defineEmits<{
  click: []
  delete: []
}>()

function onClick() {
  if (disabled) return
  emit('click')
}

function onView(e: MouseEvent) {
  e.stopPropagation()
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
    class="relative flex items-center justify-center size-full group rounded-md"
    @click="onClick"
  >
    <img
      class="w-full max-h-[28.125rem] object-contain"
      alt="Preview Image"
      :src="url"
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
