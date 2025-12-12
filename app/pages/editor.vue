<script setup lang="ts">
import type { Editor, EditorMode } from '~/core/Editor'
import { useDebounceFn, useResizeObserver } from '@vueuse/core'
import EditorProvider, {
  provideEditorContext,
} from '~/providers/EditorProvider.vue'
import AlertModal from '~/components/modals/AlertModal.vue'
import { DEFAULT_LINE_COLOR, DEFAULT_LINE_WIDTH } from '#shared/constants'
import { injectTaskContext } from '~/providers/TaskProvider.vue'
import { Task } from '~/libs/task-queue'
import { TranslationLinkModal } from '#components'

definePageMeta({
  middleware: ['protected'],
})

const pageStore = usePageStore()
const { curPage, tagList } = storeToRefs(pageStore)
const tagStore = useTagStore()
const ossImage = useOSSImage()
const autoSave = useAutoSave()
const taskContext = injectTaskContext()
const translationGenerator = useTranslationGenerator()

const editor = shallowRef<Editor>()
const editorContainer = useTemplateRef<HTMLDivElement>('editor-container')
const isEditorReady = ref<boolean>(false)
const scale = ref<number>(1)
const mode = ref<EditorMode>('draw')
const lineWidth = ref<number>(DEFAULT_LINE_WIDTH)
const lineColor = ref<string>(DEFAULT_LINE_COLOR)
const toast = useToast()

useResizeObserver(
  editorContainer,
  useDebounceFn(() => {
    if (editor.value?.ready) {
      editor.value?.autoFitImage()
    }
  }, 200)
)

const overlay = useOverlay()
const transLinkModal = overlay.create(TranslationLinkModal, {
  props: {
    onClose: () => {},
  },
})

const showCanvasErrorMask = computed(() => {
  return !validID(curPage.value?.id) || !curPage.value?.image
})

const isImageLoading = ref(false)
watchEffect(() => {
  if (!editor.value || !curPage.value) return
  const initImage = async () => {
    const imageUrl = await ossImage.get(curPage.value?.image)
    editor.value?.setImage(imageUrl)
  }
  if (!editor.value.ready) {
    editor.value.waitReady(initImage)
    return
  }
  initImage()
})

onMounted(async () => {
  const imageUrl = await ossImage.get(curPage.value?.image)
  // @ts-expect-error support dynamic import
  const { Editor } = await import('~/core/Editor')

  if (!editorContainer.value) return

  editor.value = new Editor(editorContainer.value, mode.value)
  editor.value.setImage(imageUrl)
  editor.value.setLineWidth(lineWidth.value)

  editor.value.on('ready', () => {
    isEditorReady.value = true
  })

  editor.value.on('image-load', () => {
    isImageLoading.value = true
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
      if (payload.translationID || payload.translation) {
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
                toast.add({
                  title: 'Success',
                  description: 'Tag deleted successfully',
                  color: 'success',
                  icon: 'i-lucide:circle-check',
                })
                close()
              } catch (error) {
                fail(error)
              } finally {
                _deleteModal.patch({ loading: false })
              }
            },
            onClose: (isOK: boolean) => {
              !isOK && success(false)
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
    }
  )

  editor.value.asyncOn<{ id: ID; update: Partial<ITag> }>(
    'async-tag-update',
    async ({ success, fail, payload }) => {
      try {
        const { id, update } = payload
        const updatedTag = await tagStore.updateTag(id, update)
        success(updatedTag)
      } catch (error) {
        fail(error)
      }
    }
  )

  editor.value.on('tag-change', (arg: { action: string; tag: ITag }) =>
    autoSave.add(arg.tag)
  )

  const { open: openTagModal } = useTagModal()
  editor.value.connectOn<'connect-tag-info', ITag, ITag | undefined>(
    'connect-tag-info',
    async ({ send, disconnect, payload }) => {
      const clip = await Editor.imageClipper.clip({
        x: payload.x,
        y: payload.y,
        width: payload.width,
        height: payload.height,
        quality: 1,
      })
      openTagModal({
        tag: payload,
        clip,
        onSave: (updatedTag) => send(updatedTag),
        onCreateTranslation: (updatedTag) => send(updatedTag),
        onCreateI18nKey: (updatedTag) => send(updatedTag),
        onClose: (isOK) => {
          !isOK && send(undefined)
          disconnect()
        },
      })
    }
  )

  editor.value.asyncOn<{ image: string; tag: ITag }>(
    'async-tag-ocr',
    async ({ success, fail, payload }) => {
      const ocrTask = new Task(
        async () => {
          try {
            const { image, tag } = payload
            const updatedTranslation = await translationGenerator.ocr({ image })
            if (updatedTranslation) {
              const updatedTag = await tagStore.updateTag(tag.id, {
                translationID: updatedTranslation.id,
              })
              success(updatedTag)
              toast.add({
                title: 'Success',
                description: 'Translation created',
                color: 'success',
                icon: 'i-lucide:check',
              })
            } else success(undefined)
          } catch (error) {
            fail(error)
          }
        },
        {
          name: 'Tag OCR',
          description: 'Generating translation for tag',
        }
      )
      taskContext.push(ocrTask)
    }
  )

  editor.value.asyncOn<ITag>(
    'async-tag-link',
    async ({ success, fail, payload }) => {
      try {
        transLinkModal.open({
          onSave: async (translation, { close }: { close: () => void }) => {
            if (translation) {
              const updatedTag = await tagStore.updateTag(payload.id, {
                translationID: translation.id,
              })
              success(updatedTag)
              toast.add({
                title: 'Success',
                description: 'Translation linked',
                color: 'success',
                icon: 'i-lucide:check',
              })
            } else {
              success(undefined)
            }
            close()
          },
          onClose: (isOK: boolean) => {
            !isOK && success(undefined)
          },
        })
      } catch (error) {
        fail(error)
      }
    }
  )

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
