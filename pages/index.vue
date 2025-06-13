<script setup lang="ts">
import { useDebounceFn, useResizeObserver } from '@vueuse/core'
import type { Editor } from '~/core/Editor'

let editor: Editor
const editorContainer = useTemplateRef<HTMLDivElement>('editor-container')

useResizeObserver(
  editorContainer,
  useDebounceFn(() => {
    if (editor.ready) {
      editor.autoFitImage()
    }
  }, 200)
)

onMounted(async () => {
  const module = await import('~/core/Editor')
  if (!editorContainer.value) return
  editor = new module.Editor(editorContainer.value, 'draw')
  editor.setImage('/sample.png')

  editor.on('auto-fit', (e) => {
    console.log('auto-fit', e)
  })
})
</script>

<template>
  <div class="flex h-full">
    <AppSider class="relative z-10" />
    <div class="relative flex-1 overflow-hidden flex flex-col">
      <AppToolbar />
      <div class="flex-1 p-2 bg-gray-100">
        <client-only>
          <div ref="editor-container" class="size-full" />
        </client-only>
      </div>
    </div>
  </div>
</template>

<style scoped></style>
