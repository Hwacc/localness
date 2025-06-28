import type { ITag } from '~/types/interfaces'
import { Tag } from '~/types/Tag'
import { omit } from 'lodash-es'
import type { ID } from '~/types/global'

export const useTagStore = defineStore('tag', () => {
  const pageStore = usePageStore()
  const curTag = ref<ITag>(new Tag())

  async function addTag(tag: ITag) {
    const pageID = pageStore.curPage.id
    const addedTag = await useApi('/api/tag', {
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
    console.log('addedTag', addedTag)
    if (addedTag) {
      pageStore.tagList.push(addedTag)
    }
    return addedTag
  }

  async function deleteTag(tID: ID) {
    const deletedTag = await useApi(`/api/tag/${tID}`, {
      method: 'DELETE',
    })
    if (deletedTag) {
      pageStore.setTags(pageStore.tagList.filter((t) => t.id !== tID))
    }
    return deletedTag
  }

  async function updateTag(tagID: ID, tag: Partial<ITag>) {
    const updatedTag = await useApi(`/api/tag/${tagID}`, {
      method: 'POST',
      body: {
        ...omit(tag, ['id', 'createdAt', 'updatedAt', 'translation']),
      },
    })
    if (updatedTag) {
      pageStore.setTags(
        pageStore.tagList.map((t) => {
          if (t.id === tagID) {
            return updatedTag
          }
          return t
        })
      )
    }
    return updatedTag
  }

  return {
    curTag,
    addTag,
    deleteTag,
    updateTag,
  }
})

export type TagStore = ReturnType<typeof useTagStore>
