import type { IPage } from '~/types/interfaces'
import { Page } from '~/types/page'

export const usePageStore = defineStore('page', () => {
  const projectStore = useProjectStore()
  const { curProject } = storeToRefs(projectStore)

  const page = ref<IPage>(new Page())

  function createpage() {}

  function updatePage() {}

  return { page, createpage, updatePage }
})
