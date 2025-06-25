<script setup lang="ts">
import type { Editor, EditorMode } from '~/core/Editor'
import type { ITag } from '~/types/interfaces'
import { useDebounceFn, useResizeObserver } from '@vueuse/core'
import { merge } from 'lodash-es'
import TagInfoModal from '~/components/modals/TagInfoModal.vue'

import EditorProvider, {
  provideEditorContext,
} from '~/providers/EditorProvider.vue'

definePageMeta({
  middleware: ['protected'],
})

const pageStore = usePageStore()
const { curPage } = storeToRefs(pageStore)
const qiniuImage = useQiniuImage()

const editor = shallowRef<Editor>()
const editorContainer = useTemplateRef<HTMLDivElement>('editor-container')
const ready = ref<boolean>(false)
const scale = ref<number>(1)
const mode = ref<EditorMode>('draw')
const line = ref<number>(2)

useResizeObserver(
  editorContainer,
  useDebounceFn(() => {
    if (ready.value) {
      editor.value?.autoFitImage()
    }
  }, 200)
)

const tagList = ref<ITag[]>([])
const tagOverlay = useOverlay()
function openTagInfoModal(props: {
  tag: ITag
  onSave: (newTag: ITag) => void
}) {
  tagOverlay.create(TagInfoModal, { props }).open()
}

watch(curPage, async () => {
  if (ready.value) {
    const url = await qiniuImage.get(curPage.value?.image)
    editor.value?.setImage(url)
  }
})

onMounted(async () => {
  const module = await import('~/core/Editor')
  if (!editorContainer.value) return
  editor.value = new module.Editor(editorContainer.value, mode.value)

  console.log('mounted', curPage.value)
  const url = await qiniuImage.get(curPage.value?.image)
  editor.value.setImage(url)
  editor.value.setLineWidth(line.value)

  editor.value.on('ready', () => {
    ready.value = true
  })
  editor.value.on('mode-change', (_mode: EditorMode) => {
    mode.value = _mode
  })
  editor.value.on('scale-change', (_scale: number) => (scale.value = _scale))
  editor.value.on('tag-add', (tag: ITag) => {
    console.log('tag-add', tag)
    tagList.value = [...tagList.value, tag]
  })
  editor.value.on('tag-info', (tag: ITag) => {
    openTagInfoModal({
      tag,
      onSave: (newTag) => {
        tagList.value = tagList.value.map((t) =>
          t.id === newTag.id ? newTag : t
        )
      },
    })
  })
  editor.value.on('tag-remove', (tag: ITag) => {
    tagList.value = tagList.value.filter((t) => t.id !== tag.id)
  })
  editor.value.on('tag-change', (arg: { action: string; tag: ITag }) => {
    const { tag } = arg
    tagList.value = tagList.value.map((t) =>
      t.id === tag.id ? merge(t, tag) : t
    )
  })
})

provideEditorContext({
  editor,
  ready,
  scale,
  mode,
  line,
})
</script>

<template>
  <div class="flex h-full">
    <EditorProvider>
      <AppSider class="relative z-10" />
      <div class="relative flex-1 overflow-hidden flex flex-col">
        <AppToolbar />
        <div class="flex-1 p-2 bg-gray-100">
          <div ref="editor-container" class="size-full" />
        </div>
      </div>
    </EditorProvider>
  </div>
</template>
