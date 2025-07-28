import { AlertModal } from '#components'
import { isEmpty } from 'lodash-es'

export function useAutoSave() {
  const toast = useToast()
  const overlay = useOverlay()

  const askModal = overlay.create(AlertModal, {
    props: {
      mode: 'warning',
      title: 'Warning',
      message: 'You have unsaved changes. Do you want to save them now?',
      okText: 'Save Now',
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
      reset()
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

  function remove(id: ID) {
    tagChangeList.value = tagChangeList.value.filter((tag) => tag.id !== id)
  }

  function reset() {
    autoSaveTimer.value && clearTimeout(autoSaveTimer.value)
    tagChangeList.value = []
    autoSaveTimer.value = null
  }

  watch(tagChangeList, async (list) => {
    if (!isEmpty(list) && !autoSaveTimer.value) {
      autoSaveTimer.value = setTimeout(async () => {
        await immediate()
        reset()
      }, 60 * 1000 * 2) as unknown as number // 2 min
    }
  })

  const onBeforeUnload = (e: BeforeUnloadEvent) => {
    if (!isEmpty(tagChangeList.value)) {
      e.preventDefault()
      return
    }
  }
  onMounted(() => {
    window.addEventListener('beforeunload', onBeforeUnload)
  })
  onUnmounted(() => {
    window.removeEventListener('beforeunload', onBeforeUnload)
  })

  return {
    tagChangeList,
    add,
    ask,
    immediate,
    reset,
    remove
  }
}
