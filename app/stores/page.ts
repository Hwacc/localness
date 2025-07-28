import { isEmpty } from 'lodash-es'

export const usePageStore = defineStore('page', () => {
  const toast = useToast()
  const projectStore = useProjectStore()
  const curPage = ref<IPage>(new Page())

  const tagList = ref<ITag[]>([])

  async function createPage(page: Pick<IPage, 'name' | 'image' | 'settings'>) {
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

    const createdPage = await useApi<IPage>('/api/page', {
      method: 'POST',
      body: {
        projectID: projectStore.curProject.id,
        ...page,
      },
    })
    if (!createdPage) return null
    projectStore.curProject.pages?.unshift(createdPage)
    if (!curPage.value.id) {
      curPage.value = createdPage
    }
    if (import.meta.client) {
      toast.add({
        title: 'Success',
        description: 'Page created successfully',
        color: 'success',
        icon: 'i-lucide:circle-check',
      })
    }
    return createdPage
  }

  async function updatePage(
    id: ID,
    page: Partial<Pick<IPage, 'name' | 'image' | 'settings'>>
  ) {
    if (!validID(id)) return
    const updatedPage = await useApi<IPage>(`/api/page/${id}`, {
      method: 'POST',
      body: page,
    })
    if (updatedPage) {
      const pages = projectStore.curProject.pages?.map((p) => {
        if (p.id === updatedPage.id) {
          p.name = updatedPage.name
          p.image = updatedPage.image
          p.settings = updatedPage.settings
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

  async function deletePage(id: ID) {
    if (!validID(id)) return
    const deletedPage = await useApi<IPage>(`/api/page/${id}`, {
      method: 'DELETE',
    })
    if (deletedPage) {
      projectStore.curProject.pages = projectStore.curProject.pages?.filter(
        (p) => p.id !== id
      )
      if (curPage.value.id === id) {
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
      if (validID(page.id)) await loadTags(page.id)
    } finally {
      curPage.value = page
    }
  }

  async function loadTags(pageID?: ID) {
    tagList.value =
      (await useApi<ITag[]>(
        `/api/page/tags?pageID=${pageID || curPage.value.id}`
      )) || []
    return tagList.value
  }

  function setTags(tags: ITag[] = []) {
    tagList.value = [...tags]
  }

  /**
   * Update tag in page tagList
   * @param tag
   */
  function updateTag(tag: ITag) {
    tagList.value = tagList.value.map((t) => {
      if (t.id === tag.id) {
        return tag
      }
      return t
    })
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
    updateTag,
  }
})

export type PageStore = ReturnType<typeof usePageStore>
