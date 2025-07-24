import { flatMapDeep, isEmpty } from 'lodash-es'
import { ExportWorkerBells } from '~/assets/workers/export/types'
import TaskQueue, { Task } from '~/libs/task-queue'
import type { IProject } from '~/types/Project'
import JSZip from 'jszip'

interface WorkerEx extends Worker {
  postAsyncMessage: (
    message: {
      bell: string
    } & Record<string, any>
  ) => Promise<any>
}

export function useProjectExport() {
  const worker = shallowRef<WorkerEx>()
  const ready = ref(false)
  const projectStore = useProjectStore()
  const ossImage = useOSSImage()

  if (import.meta.client) {
    // @ts-expect-error Vite worker import, no type declaration available
    import('~/assets/workers/export/index.ts?worker')
      .then((res) => {
        worker.value = new res.default()
        if (!worker.value) return
        worker.value.postAsyncMessage = (
          message: {
            bell: string
          } & Record<string, any>
        ) => {
          return new Promise((resolve, reject) => {
            const _listner = (e: MessageEvent) => {
              const { bell, result, error } = e.data
              if (bell === message.bell) {
                resolve(result)
              }
              if (bell === `error:${message.bell}`) {
                reject(error)
              }
              reject(new Error('Unknown error'))
              worker.value?.removeEventListener('message', _listner)
            }
            worker.value?.addEventListener('message', _listner)
            worker.value?.postMessage({ ...message, type: 'async' })
          })
        }
        worker.value.addEventListener('message', (e: MessageEvent) => {
          const { bell } = e.data
          if (bell === ExportWorkerBells.READY) {
            ready.value = true
          }
        })
      })
      .catch((error) => {
        console.error('Export worker error', error)
      })
  }

  function exportProject() {
    if (!ready.value) return null
    const queue = new TaskQueue({
      concurrency: 1,
      explosive: true,
    })

    const requestTask = new Task(
      async (_, context) => {
        const project = await useApi<IProject>(
          `/api/project/export/${projectStore.curProject.id}`,
          {
            method: 'POST',
          }
        )
        context.project = project
        if (!isEmpty(project.pages)) {
          const pageTasks = project.pages.map((page) => {
            const pageQueue = new TaskQueue({
              concurrency: 1,
              name: `Export page ${page.name}`,
              description: `Exporting page ${page.name}...`,
            })
            const imageUrlTask = new Task(
              async () => {
                const image = await ossImage.get(page.image)
                await worker.value?.postAsyncMessage({
                  bell: ExportWorkerBells.PRE_PAINT,
                  payload: {
                    page,
                    image: `${image}?t=${Date.now()}`,
                  },
                })
                return { status: 'ok' }
              },
              {
                name: `Get image ${page.name}`,
                description: `Getting image ${page.name}...`,
              }
            )
            const generateTagsTask = new Task(
              async () => {
                const tags = page.tags
                await worker.value?.postAsyncMessage({
                  bell: ExportWorkerBells.SET_TAGS,
                  payload: {
                    tags,
                  },
                })
                return { status: 'ok' }
              },
              {
                name: `Generate tags`,
                description: `Generating tags...`,
              }
            )
            const genrateImageTask = new Task(
              async (_, context) => {
                const res = await worker.value?.postAsyncMessage({
                  bell: ExportWorkerBells.PAINT,
                })
                context.images.push({
                  name: `${page.name}.jpg`,
                  data: res.data,
                })
                return { status: 'ok' }
              },
              {
                name: `Generate image`,
                description: `Generating image...`,
              }
            )
            pageQueue.push(imageUrlTask)
            pageQueue.push(generateTagsTask)
            pageQueue.push(genrateImageTask)
            return pageQueue
          })
          queue.unshiftPatch(...pageTasks)
        }
        context.images = new Array<{ name: string; data: Blob }>()
        return { status: 'ok' }
      },
      {
        name: 'Collect Project Data',
        description: 'Collecting project data for export...',
      }
    )

    const generateXlsxTask = new Task(
      async (_, context) => {
        console.log('generate xlsx', context)
        const project = context.project as IProject
        const allTags = flatMapDeep(project.pages, (page) => {
          return page.tags.map((tag) => {
            return {
              ...tag,
              pic: `${page.name}.jpg`,
            }
          })
        })
        const res = await worker.value?.postAsyncMessage({
          bell: ExportWorkerBells.GENERATE_XLSX,
          payload: { tags: allTags },
        })
        context.xlsx = res.data
        return { status: 'ok' }
      },
      {
        name: 'Generate xlsx',
        description: 'Generating xlsx...',
      }
    )
    const generateZipTask = new Task(
      async (_, context) => {
        const zip = new JSZip()
        if (!isEmpty(context.images)) {
          context.images.forEach((image: { name: string; data: Blob }) => {
            zip.file(image.name, image.data)
          })
        }
        context.xlsx && zip.file(`${context.project.name}.xlsx`, context.xlsx)
        const buffer = await zip.generateAsync({ type: 'blob' })
        context.zip = buffer
        return { status: 'ok' }
      },
      {
        name: 'Generate zip',
        description: 'Generating zip...',
      }
    )
    const downloadTask = new Task(
      async (_, context) => {
        const blob = context.zip
        const url = URL.createObjectURL(blob)
        const a = document.createElement('a')
        a.href = url
        a.download = `${context.project.name}.zip`
        a.click()
        URL.revokeObjectURL(url)
        return { status: 'ok' }
      },
      {
        name: 'Download',
        description: 'Downloading...',
      }
    )
    queue.push(requestTask)
    queue.push(generateXlsxTask)
    queue.push(generateZipTask)
    queue.push(downloadTask)
    return queue
  }

  onUnmounted(() => {
    worker.value?.terminate()
    worker.value = undefined
  })

  return {
    ready,
    exportProject,
  }
}
