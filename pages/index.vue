<script setup lang="ts">
import { useDebounceFn, useResizeObserver } from '@vueuse/core'
import type { Editor } from '~/core/Editor'

const editorContainer = useTemplateRef<HTMLDivElement>('editor-container')
const editor = ref<Editor>()

useResizeObserver(
  editorContainer,
  useDebounceFn(() => {
    if (editor.value?.ready) {
      editor.value.autoFitImage()
    }
  }, 200)
)

onMounted(async () => {
  const module = await import('~/core/Editor')
  if (!editorContainer.value) return
  editor.value = new module.Editor(editorContainer.value, 'draw')

  editor.value.setImage('/sample-image.jpg')
})
</script>

<template>
  <div class="flex h-full">
    <AppSider class="relative z-10" />
    <div class="relative flex-1 overflow-hidden flex flex-col">
      <AppToolbar />
      <div class="flex-1 p-2 bg-gray-100">
        <client-only>
          <div
            ref="editor-container"
            class="size-full"
          />
        </client-only>
      </div>
    </div>
  </div>
</template>

<style scoped></style>
