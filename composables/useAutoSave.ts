import type { ITag } from "~/types/interfaces"

export const useAutoSave = async () => {
  const tagStore = useTagStore()
  const tagChangeList = ref<ITag[]>([])
  const autoSaveTimer = ref<number | null>(null)

  function reset() {
    tagChangeList.value = []
  }

  watch(tagChangeList, async (list) => {
    if(list.length > 0 && !autoSaveTimer.value) {
      autoSaveTimer.value = setTimeout(() => {
        tagStore.updateTags(list)
        reset()
      }, 1000) as unknown as number
    }
  })
  return {
    tagChangeList,
    reset
  }
}