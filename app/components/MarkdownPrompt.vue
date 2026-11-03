<script lang="ts" setup>
// @ts-expect-error it could import
import { Editor as BytemdEditor } from '@bytemd/vue-next'

const { modelValue = '' } = defineProps<{
  modelValue?: string | null
}>()

const emit = defineEmits<{
  'update:modelValue': [value: string]
}>()
</script>

<template>
  <!--
    Fills the pane of a SettingsTabs side layout (fixed height from `sm`).
    Below `sm` the pane grows with its content, so the editor keeps the
    300px bytemd ships with. The Vue wrapper mounts `.bytemd` inside a div of
    its own, so that div needs the height too.
  -->
  <div class="markdown-prompt h-75 sm:h-full">
    <BytemdEditor
      class="h-full"
      placeholder="Enter your prompt"
      :value="modelValue"
      :max-length="2000"
      :editor-config="{
        fullScreen: false,
      }"
      @change="(v:string) => emit('update:modelValue', v)"
    />
  </div>
</template>

<style scoped>
.markdown-prompt :deep(.bytemd) {
  height: 100%;
}
</style>
