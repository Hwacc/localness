import type { IPage } from '~/types/interfaces'
import { Page } from '~/types/page'

export const usePageStore = defineStore('page', () => {
  const toast = useToast()
  const projectStore = useProjectStore()
  const curPage = ref<IPage>(new Page())

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

  function updatePage() {}

  function setCurrentPage(page: IPage) {
    curPage.value = page
  }

  return { curPage, createPage, updatePage, setCurrentPage }
})
