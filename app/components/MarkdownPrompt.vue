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
  <div>
    <BytemdEditor
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
