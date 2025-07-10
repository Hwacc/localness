<script setup lang="ts">
import type { Editor, EditorMode } from '~/core/Editor'
import type { ITag } from '~/types/Tag'
import { useDebounceFn, useResizeObserver } from '@vueuse/core'
import TagInfoModal from '~/components/modals/TagInfoModal.vue'

import EditorProvider, {
  provideEditorContext,
} from '~/providers/EditorProvider.vue'
import AlertModal from '~/components/modals/AlertModal.vue'
import type { ID } from '~/types/global'
import { DEFAULT_LINE_COLOR, DEFAULT_LINE_WIDTH } from '~/constants'
import { injectTaskContext } from '~/providers/TaskProvider.vue'
import { Task } from '~/libs/task-queue'
import { TranslationLinkModal } from '#components'
import type { ITranslation } from '~/types/Translation'

definePageMeta({
  middleware: ['protected'],
})

const pageStore = usePageStore()
const { curPage, tagList } = storeToRefs(pageStore)
const tagStore = useTagStore()
const qiniuImage = useQiniuImage()
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
const tagModal = overlay.create(TagInfoModal, {
  props: {
    tag: {} as ITag,
    clip: '',
    onSave: () => {},
    onCreateTrans: () => {},
    onClose: () => {},
  },
})
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
      console.log('async-tag-remove', payload)
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

  editor.value.asyncOn<ITag>(
    'async-tag-info',
    async ({ success, fail, payload }) => {
      const clip = await Editor.imageClipper.clip({
        x: payload.x,
        y: payload.y,
        width: payload.width,
        height: payload.height,
        quality: 1,
      })
      tagModal.patch({
        tag: payload,
        clip,
        loading: false,
        onSave: (tag, translation, close) => {
          try {
            tagModal.patch({ loading: true })
            console.log('on tag save', tag, translation)
            if (translation) {
              // TODO: update translation
            }
            // TODO: update tag
            success(tag)
            close()
          } catch (error) {
            fail(error)
          } finally {
            tagModal.patch({ loading: false })
          }
        },
        onCreateTrans: async (type, _translation) => {
          try {
            tagModal.patch({ loading: true })
            const handleUpdateTag = async (
              trans: ITranslation | null | undefined
            ) => {
              if (trans && trans.id) {
                const updatedTag = await tagStore.updateTag(payload.id, {
                  translationID: trans.id,
                })
                tagModal.patch({
                  tag: updatedTag,
                })
                success(updatedTag)
                toast.add({
                  title: 'Success',
                  description:
                    type === 'link'
                      ? 'Translation linked'
                      : 'Translation created',
                  color: 'success',
                  icon: 'i-lucide:check',
                })
              } else success(undefined)
            }
            if (type === 'ocr') {
              // ocr -> create translation -> update tag
              const createdTrans = await translationGenerator.ocr({
                image: clip,
              })
              handleUpdateTag(createdTrans)
            } else if (type === 'link') {
              // link -> link a existing translation -> update tag
              transLinkModal.patch({
                onSave: async (trans, { close }: { close: () => void }) => {
                  handleUpdateTag(trans)
                  close()
                },
                onClose: (isOK: boolean) => {
                  !isOK && success(undefined)
                },
              })
              transLinkModal.open()
            } else if (type === 'manual') {
              // manual -> create translation -> update tag
              console.log('manual', _translation?.fingerprint)
              const createdTrans = await translationGenerator.manual({
                translation: _translation as ITranslation,
              })
              console.log('createdTrans', createdTrans?.fingerprint)
              handleUpdateTag(createdTrans)
            }
          } catch (error) {
            fail(error)
          } finally {
            tagModal.patch({ loading: false })
          }
        },
        onClose: (isOK: boolean) => {
          !isOK && success(undefined)
        },
      })
      tagModal.open()
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
        transLinkModal.patch({
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
        transLinkModal.open()
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
