import { omit } from 'lodash-es'

export const useTagStore = defineStore('tag', () => {
  const pageStore = usePageStore()

  async function getTag(id: ID) {
    const tag = await useApi<ITag>(`/api/tag/${id}`)
    return tag
  }

  async function addTag(tag: ITag) {
    const pageID = pageStore.curPage.id
    const addedTag = await useApi<ITag>('/api/tag', {
      method: 'POST',
      body: {
        pageID,
        ...omit(tag, [
          'id',
          'pageID',
          'createdAt',
          'updatedAt',
          'translationID',
          'translation',
        ]),
      },
    })
    if (addedTag) {
      pageStore.tagList.push(addedTag)
    }
    return addedTag
  }

  async function deleteTag(id: ID) {
    if(!validID(id)) return
    const deletedTag = await useApi(`/api/tag/${id}`, {
      method: 'DELETE',
    })
    if (deletedTag) {
      pageStore.setTags(pageStore.tagList.filter((t) => t.id !== id))
    }
    return deletedTag
  }

  async function updateTag(id: ID, tag: Partial<ITag>) {
    if(!validID(id)) return
    const updatedTag = await useApi<ITag>(`/api/tag/${id}`, {
      method: 'POST',
      body: {
        ...omit(tag, ['id', 'createdAt', 'updatedAt', 'translation']),
      },
    })
    if (updatedTag) {
      pageStore.setTags(
        pageStore.tagList.map((t) => {
          if (t.id === id) {
            return updatedTag
          }
          return t
        })
      )
    }
    return updatedTag
  }

  return {
    getTag,
    addTag,
    deleteTag,
    updateTag,
  }
})

export type TagStore = ReturnType<typeof useTagStore>
