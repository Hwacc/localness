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
    A fixed height from `sm`, since the pane of a SettingsTabs side layout only
    has a minimum height and `h-full` would not resolve. Below `sm` the editor
    keeps the 300px bytemd ships with. The Vue wrapper mounts `.bytemd` inside
    a div of its own, so that div needs the height too.
  -->
  <div class="markdown-prompt h-75 sm:h-[min(28rem,55vh)]">
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
