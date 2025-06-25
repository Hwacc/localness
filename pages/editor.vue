<script setup lang="ts">
import type { Editor, EditorMode } from '~/core/Editor'
import type { ITag } from '~/types/interfaces'
import { useDebounceFn, useResizeObserver } from '@vueuse/core'
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
const isEditorReady = ref<boolean>(false)
const scale = ref<number>(1)
const mode = ref<EditorMode>('draw')
const line = ref<number>(2)

useResizeObserver(
  editorContainer,
  useDebounceFn(() => {
    if (isEditorReady.value) {
      editor.value?.autoFitImage()
    }
  }, 200)
)

const overlay = useOverlay()
const tagModal = overlay.create(TagInfoModal, {
  props: {
    tag: {} as ITag,
    onSave: () => {},
  },
})

watch(curPage, async () => {
  if (isEditorReady.value) {
    const tagList =
      (await useApi<ITag[]>(`/api/page/tags?pageID=${curPage.value?.id}`)) || []
    const imageUrl = await qiniuImage.get(curPage.value?.image)
    editor.value?.setImage(imageUrl)
    editor.value?.setTags(tagList)
  }
})

onMounted(async () => {
  const tagList =
    (await useApi<ITag[]>(`/api/page/tags?pageID=${curPage.value?.id}`)) || []
  const imageUrl = await qiniuImage.get(curPage.value?.image)
  const { Editor } = await import('~/core/Editor')

  if (!editorContainer.value) return
  editor.value = new Editor(editorContainer.value, mode.value)
  editor.value.setImage(imageUrl)
  editor.value.setTags(tagList)
  editor.value.setLineWidth(line.value)

  editor.value.on('ready', () => {
    isEditorReady.value = true
  })

  editor.value.on('mode-change', (_mode: EditorMode) => {
    mode.value = _mode
  })
  editor.value.on('scale-change', (_scale: number) => (scale.value = _scale))

  editor.value.on('tag-add', (tag: ITag) => {
    // console.log('tag-add', tag)
  })
  editor.value.on('tag-click', (tag: ITag) => {
    // console.log('tag-click', tag)
  })
  editor.value.on('tag-info', (tag: ITag) => {
    // console.log('tag-info', tag)
    tagModal.open()
  })
  editor.value.on('tag-remove', (tag: ITag) => {
    // console.log('tag-remove', tag)
  })
  editor.value.on('tag-change', (arg: { action: string; tag: ITag }) => {
    // console.log('tag-change', arg)
  })
})

provideEditorContext({
  editor,
  ready: isEditorReady,
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
