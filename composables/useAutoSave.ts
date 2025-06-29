import { AlertModal } from '#components'
import { isEmpty } from 'lodash-es'
import type { ITag } from '~/types/interfaces'

export const useAutoSave = () => {
  const toast = useToast()
  const overlay = useOverlay()

  const askModal = overlay.create(AlertModal, {
    props: {
      mode: 'warning',
      title: 'Warning',
      message: 'Unsaved changes will be lost',
      loading: false,
    },
  })

  const tagStore = useTagStore()
  const tagChangeList = ref<ITag[]>([])
  const autoSaveTimer = ref<number | null>(null)

  function add(tag: ITag) {
    const foundIndex = tagChangeList.value.findIndex(
      (item) => item.id === tag.id
    )
    if (foundIndex !== -1) {
      tagChangeList.value = [
        ...tagChangeList.value.filter((_, i) => i !== foundIndex),
        tag,
      ]
    } else {
      tagChangeList.value = [...tagChangeList.value, tag]
    }
  }

  async function immediate() {
    if (isEmpty(tagChangeList.value)) return
    autoSaveTimer.value && clearTimeout(autoSaveTimer.value)
    const savePromises = tagChangeList.value.map((tag) =>
      tagStore.updateTag(tag.id, tag)
    )
    try {
      const savedList = await Promise.all(savePromises)
      reset()
      toast.add({
        title: 'Success',
        description: 'Tags saved successfully',
        color: 'success',
        icon: 'i-lucide:check',
      })
      return savedList
    } catch (error) {
      console.error('Save tag error:', error)
    }
  }

  async function ask(): Promise<void> {
    if (isEmpty(tagChangeList.value)) return Promise.resolve()
    return new Promise((resolve, reject) => {
      askModal.patch({
        onClose: () => {
          reset()
          resolve()
        },
        onOk: async (_, { close }) => {
          try {
            askModal.patch({ loading: true })
            await immediate()
            resolve()
            close()
          } catch (error) {
            reject(error)
          } finally {
            askModal.patch({ loading: false })
          }
        },
      })
      askModal.open()
    })
  }

  function reset() {
    autoSaveTimer.value && clearTimeout(autoSaveTimer.value)
    tagChangeList.value = []
    autoSaveTimer.value = null
  }

  watch(tagChangeList, async (list) => {
    if (list.length > 0 && !autoSaveTimer.value) {
      autoSaveTimer.value = setTimeout(async () => {
        await immediate()
        reset()
      }, 60 * 1000 * 2) as unknown as number // 2 min
    }
  })

  return {
    tagChangeList,
    add,
    ask,
    immediate,
    reset,
  }
}
