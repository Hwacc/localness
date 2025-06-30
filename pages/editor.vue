<script setup lang="ts">
import type { Editor, EditorMode } from '~/core/Editor'
import type { ITag } from '~/types/interfaces'
import { useDebounceFn, useResizeObserver } from '@vueuse/core'
import TagInfoModal from '~/components/modals/TagInfoModal.vue'

import EditorProvider, {
  provideEditorContext,
} from '~/providers/EditorProvider.vue'
import AlertModal from '~/components/modals/AlertModal.vue'
import type { ID } from '~/types/global'
import { DEFAULT_LINE_COLOR, DEFAULT_LINE_WIDTH } from '~/constants'
import { injectTaskContext } from '~/providers/TaskProvider.vue'
import { Task } from '~/types/Task'

definePageMeta({
  middleware: ['protected'],
})

const pageStore = usePageStore()
const { curPage, tagList } = storeToRefs(pageStore)
const tagStore = useTagStore()
const qiniuImage = useQiniuImage()
const autoSave = useAutoSave()

const editor = shallowRef<Editor>()
const editorContainer = useTemplateRef<HTMLDivElement>('editor-container')
const isEditorReady = ref<boolean>(false)
const scale = ref<number>(1)
const mode = ref<EditorMode>('draw')
const lineWidth = ref<number>(DEFAULT_LINE_WIDTH)
const lineColor = ref<string>(DEFAULT_LINE_COLOR)

const taskContext = injectTaskContext()

useResizeObserver(
  editorContainer,
  useDebounceFn(() => {
    if (editor.value?.ready) {
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

const showCanvasErrorMask = computed(() => {
  return !validID(curPage.value?.id) || !curPage.value?.image
})

const isImageLoading = ref(false)
watchEffect(() => {
  if (!editor.value || !curPage.value) return
  const initImage = async () => {
    isImageLoading.value = true
    const imageUrl = await qiniuImage.get(curPage.value?.image)
    editor.value?.setImage(imageUrl)
  }
  if (!editor.value.ready) {
    editor.value.waitReady(initImage)
    return
  }
  initImage()
})

onMounted(async () => {
  const imageUrl = await qiniuImage.get(curPage.value?.image)
  const { Editor } = await import('~/core/Editor')

  if (!editorContainer.value) return

  editor.value = new Editor(editorContainer.value, mode.value)
  editor.value.setImage(imageUrl)
  editor.value.setLineWidth(lineWidth.value)

  editor.value.on('ready', () => {
    isEditorReady.value = true
  })

  editor.value.on('image-loaded', () => {
    const _setTags = () => {
      editor.value?.setTags(tagList.value)
      isImageLoading.value = false
    }
    if (!editor.value?.ready) {
      editor.value?.waitReady(_setTags)
      return
    }
    _setTags()
  })
  editor.value.on('image-error', () => {
    isImageLoading.value = false
  })

  editor.value.on('mode-change', (_mode: EditorMode) => {
    mode.value = _mode
  })
  editor.value.on('scale-change', (_scale: number) => {
    scale.value = _scale
  })
  editor.value.on('save', () => {
    autoSave.immediate()
  })

  editor.value.asyncOn<ITag>(
    'async-tag-add',
    async ({ success, fail, payload }) => {
      try {
        const addedTag = await tagStore.addTag(payload)
        success(addedTag)
      } catch (error) {
        fail(error)
      }
    }
  )

  editor.value.asyncOn<ITag>(
    'async-tag-remove',
    async ({ success, fail, payload }) => {
      try {
        console.log('async-tag-remove', payload)
        if (payload.text || payload.translation) {
          const _deleteModal = overlay.create(AlertModal, {
            props: {
              mode: 'delete',
              title: 'Delete Tag',
              message:
                'This tag has content text or translations. Are you sure you want to delete it?',
              onOk: async (_, { close }) => {
                try {
                  _deleteModal.patch({ loading: true })
                  await tagStore.deleteTag(payload.id)
                  autoSave.remove(payload.id)
                  success(true)
                  close()
                } catch (error) {
                  fail(error)
                } finally {
                  _deleteModal.patch({ loading: false })
                }
              },
            },
          })
          _deleteModal.open()
        } else {
          try {
            await tagStore.deleteTag(payload.id)
            autoSave.remove(payload.id)
            success(true)
          } catch (error) {
            fail(error)
          }
        }
      } catch (error) {
        fail(error)
      }
    }
  )

  editor.value.asyncOn<{ tagID: ID; update: Partial<ITag> }>(
    'async-tag-update',
    async ({ success, fail, payload }) => {
      try {
        const { tagID, update } = payload
        const updatedTag = await tagStore.updateTag(tagID, update)
        success(updatedTag)
      } catch (error) {
        fail(error)
      }
    }
  )
  editor.value.on('tag-change', (arg: { action: string; tag: ITag }) =>
    autoSave.add(arg.tag)
  )

  editor.value.asyncOn<ITag>('async-tag-info', ({ success, payload }) => {
    tagModal.patch({
      tag: payload,
      onClose: (isSuccess: boolean) => {
        !isSuccess && success(undefined)
      },
      onSave: (updatedTag: Partial<ITag> | undefined) => {
        if (!updatedTag) {
          success(undefined)
          return
        }
        success(updatedTag)
      },
    })
    tagModal.open()
  })

  editor.value.on('tag-ocr', (image: string) => {
    console.log('tag-ocr', image)
    const testTask = new Task('do-ocr', 'OCR', async () => {
      await sleep(3000)
      console.log('ocr done')
    })

    console.log('task job name', testTask.job.name)

    taskContext?.add(testTask)
  })

  editor.value.on('tag-click', (_: ITag) => {})
})

onBeforeUnmount(() => {
  editor.value?.destroy()
  editor.value = undefined
})

provideEditorContext({
  editor,
  ready: isEditorReady,
  scale,
  mode,
  lineWidth,
  lineColor,
  autoSave,
})
</script>

<template>
  <div class="flex h-full">
    <EditorProvider>
      <AppSider class="relative z-10" />
      <div class="relative flex-1 overflow-hidden flex flex-col">
        <AppToolbar />
        <div class="relative flex-1 p-2 bg-gray-100">
          <div
            v-if="showCanvasErrorMask"
            class="absolute inset-0 flex flex-col items-center justify-center gap-6 bg-black/50 z-10"
          >
            <UIcon
              class="text-gray-100"
              name="i-hugeicons:sad-dizzy"
              size="64"
            />
            <p class="text-gray-200 text-2xl">Opps, No Page or Image Found</p>
          </div>
          <LoadingSpinner :loading="isImageLoading" />
          <div ref="editor-container" class="size-full" />
        </div>
      </div>
    </EditorProvider>
  </div>
</template>
