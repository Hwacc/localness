<script setup lang="ts">
import { useDebounceFn, useResizeObserver } from '@vueuse/core'
import type { Editor, EditorMode } from '~/core/Editor'

let editor: Editor
const editorContainer = useTemplateRef<HTMLDivElement>('editor-container')
const isEditorReady = ref(false)

const scale = ref<number>(1)
const scaleOptions = ref([
  {
    label: '100%',
    value: 1,
  },
  {
    label: '50%',
    value: 0.5,
  },
  {
    label: '125%',
    value: 1.25,
  },
])
const scaleText = computed(() => `${Math.trunc(scale.value * 100)}%`)
const handleScaleChange = (type: 'plus' | 'minus' | 'set', s?: number) => {
  const _scale = Math.trunc(scale.value * 10) / 10
  if (type === 'plus') {
    editor.setScale(_scale + 0.1)
  } else if (type === 'minus') {
    editor.setScale(_scale - 0.1)
  } else {
    editor.setScale(s ?? 1)
  }
}

const mode = ref<EditorMode>('draw')

useResizeObserver(
  editorContainer,
  useDebounceFn(() => {
    if (editor?.ready) {
      editor.autoFitImage()
    }
  }, 200)
)

onMounted(async () => {
  const module = await import('~/core/Editor')
  if (!editorContainer.value) return
  editor = new module.Editor(editorContainer.value, mode.value)
  editor.setImage('/sample.png')

  editor.on('ready', () => {
    isEditorReady.value = true
  })
  editor.on('mode-change', (_mode: EditorMode) => {
    mode.value = _mode
  })
  editor.on('scale-change', (_scale: number) => (scale.value = _scale))
  
  editor.on('tag-add', (tag: unknown) => {
    console.log('tag-add', tag)
  })
  editor.on('tag-info', (tag: unknown) => {
    console.log('tag-info', tag)
  })
  editor.on('tag-remove', (tag: unknown) => {
    console.log('tag-remove', tag)
  })
  editor.on('tag-change', (tag: { type: string; target: unknown }) => {
    console.log('tag-change', tag.type, tag.target)
  })
})
</script>

<template>
  <div class="flex h-full">
    <AppSider class="relative z-10" />
    <div class="relative flex-1 overflow-hidden flex flex-col">
      <AppToolbar>
        <div class="flex items-center gap-4">
          <div class="flex items-center gap-2">
            <UTooltip text="Zoom Out">
              <UButton
                icon="i-lucide:minus"
                size="md"
                color="neutral"
                variant="outline"
                :disabled="!isEditorReady || scale <= 0.1"
                @click="() => handleScaleChange('minus')"
              />
            </UTooltip>
            <USelect
              class="w-30"
              :model-value="scale"
              :items="scaleOptions"
              size="md"
              :disabled="!isEditorReady"
              @update:model-value="
                (s) => {
                  handleScaleChange('set', s)
                }
              "
            >
              <template #default>
                <div>{{ scaleText }}</div>
              </template>
            </USelect>
            <UTooltip text="Zoom In">
              <UButton
                icon="i-lucide:plus"
                size="md"
                color="neutral"
                variant="outline"
                :disabled="!isEditorReady || scale > 3"
                @click="() => handleScaleChange('plus')"
              />
            </UTooltip>
          </div>
          <UTooltip text="Drag">
            <UButton
              :class="[mode === 'drag' && 'bg-green-400 text-white']"
              icon="i-lucide:hand"
              size="md"
              color="neutral"
              variant="outline"
              :disabled="!isEditorReady || scale > 3"
              @click="() => editor.setMode('drag')"
            />
          </UTooltip>
          <UTooltip text="Add Tag">
            <UButton
              :class="[mode === 'draw' && 'bg-green-400 text-white']"
              icon="i-lucide:pencil-ruler"
              size="md"
              color="neutral"
              variant="outline"
              :disabled="!isEditorReady"
              @click="() => editor.setMode('draw')"
            />
          </UTooltip>
          <UTooltip text="Edit Tags">
            <UButton
              :class="[mode === 'edit' && 'bg-green-400 text-white']"
              icon="i-lucide:square-pen"
              size="md"
              color="neutral"
              variant="outline"
              :disabled="!isEditorReady"
              @click="() => editor.setMode('edit')"
            />
          </UTooltip>
        </div>
      </AppToolbar>
      <div class="flex-1 p-2 bg-gray-100">
        <client-only>
          <div ref="editor-container" class="size-full" />
        </client-only>
      </div>
    </div>
  </div>
</template>

<style scoped>
@reference "tailwindcss";
</style>
