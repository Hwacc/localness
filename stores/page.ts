import { isEmpty } from 'lodash-es'
import type { ID } from '~/types/global'
import type { IPage, ITag } from '~/types/interfaces'
import { Page } from '~/types/Page'

export const usePageStore = defineStore('page', () => {
  const toast = useToast()
  const projectStore = useProjectStore()
  const curPage = ref<IPage>(new Page())

  const tagList = ref<ITag[]>([])

  async function createPage({ name, image }: Pick<IPage, 'name' | 'image'>) {
    if (!projectStore.curProject.id) {
      if (import.meta.client) {
        toast.add({
          title: 'Error',
          description: 'Project not found',
          icon: 'i-lucide:circle-x',
          color: 'error',
        })
      }
      return null
    }
    const page = await useApi<IPage>('/api/page', {
      method: 'POST',
      body: {
        projectID: projectStore.curProject.id,
        name,
        image,
      },
    })
    if (!page) return null
    projectStore.curProject.pages?.unshift(page)
    if (!curPage.value.id) {
      curPage.value = page
    }
    if (import.meta.client) {
      toast.add({
        title: 'Success',
        description: 'Page created successfully',
        color: 'success',
        icon: 'i-lucide:circle-check',
      })
    }
    return page
  }

  async function updatePage(
    pageID: ID,
    page: Partial<Pick<IPage, 'name' | 'image'>>
  ) {
    const updatedPage = await useApi<IPage>(`/api/page/${pageID}`, {
      method: 'POST',
      body: page,
    })
    if (updatedPage) {
      const pages = projectStore.curProject.pages?.map((p) => {
        if (p.id === updatedPage.id) {
          p.name = updatedPage.name
          p.image = updatedPage.image
        }
        return p
      })
      projectStore.curProject.pages = pages
      if (curPage.value.id === updatedPage.id) {
        curPage.value = { ...curPage.value, ...updatedPage }
      }
      if (import.meta.client) {
        toast.add({
          title: 'Success',
          description: 'Page updated successfully',
          color: 'success',
          icon: 'i-lucide:circle-check',
        })
      }
      return true
    }
    return false
  }

  async function deletePage(pageID: ID) {
    const deletedPage = await useApi<IPage>(`/api/page/${pageID}`, {
      method: 'DELETE',
    })
    if (deletedPage) {
      projectStore.curProject.pages = projectStore.curProject.pages?.filter(
        (p) => p.id !== pageID
      )
      if (curPage.value.id === pageID) {
        curPage.value = isEmpty(projectStore.curProject.pages)
          ? new Page()
          : projectStore.curProject.pages[0]
      }
      if (import.meta.client) {
        toast.add({
          title: 'Success',
          description: 'Page deleted successfully',
          color: 'success',
          icon: 'i-lucide:circle-check',
        })
      }
    }
  }

  async function setCurrentPage(page: IPage) {
    try {
      if (validID(page.id)) {
        tagList.value = await useApi<ITag[]>(`/api/page/tags?pageID=${page.id}`)
      } else {
        tagList.value = []
      }
    } finally {
      curPage.value = page
    }
  }

  async function loadTags() {
    tagList.value =
      (await useApi<ITag[]>(`/api/page/tags?pageID=${curPage.value?.id}`)) || []
    return tagList.value
  }

  function setTags(tags: ITag[] = []) {
    tagList.value = [...tags]
  }

  return {
    curPage,
    tagList,
    loadTags,
    setTags,
    createPage,
    updatePage,
    setCurrentPage,
    deletePage,
  }
})

export type PageStore = ReturnType<typeof usePageStore>
