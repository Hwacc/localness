import { isEmpty } from 'lodash-es'
import { ExportWorkerBells } from '~/assets/workers/export/types'
import TaskQueue, { Task } from '~/libs/task-queue'
import type { IProject } from '~/types/Project'

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
      async () => {
        const project = await useApi<IProject>(
          `/api/project/export/${projectStore.curProject.id}`,
          {
            method: 'POST',
          }
        )
        worker.value?.postMessage({
          bell: ExportWorkerBells.SET_DATA,
          payload: project,
        })
        if (!isEmpty(project.pages)) {
          const pageTasks = project.pages.map((page) => {
            const pageQueue = new TaskQueue({
              concurrency: 1,
              name: `Export page ${page.name}`,
              description: `Exporting page ${page.name}...`,
            })
            const imageUrlTask = new Task(
              async (_, context) => {
                const image = await ossImage.get(page.image)
                context.image = image
                await worker.value?.postAsyncMessage({
                  bell: ExportWorkerBells.PRE_PAINT,
                  payload: {
                    page,
                    image,
                  },
                })
                return image
              },
              {
                name: `Get image ${page.name}`,
                description: `Getting image ${page.name}...`,
              }
            )
            const genrateImageTask = new Task(
              async () => {
                const res = await worker.value?.postAsyncMessage({
                  bell: ExportWorkerBells.PAINT,
                })
                console.log('paint success', res.data)
                const url = URL.createObjectURL(res.data)
                const a = document.createElement('a')
                a.href = url
                a.download = `${page.name}.jpg`
                a.click()
                URL.revokeObjectURL(url)
                return true
              },
              {
                name: `Generate image`,
                description: `Generating image...`,
              }
            )
            const generateTagsTask = new Task(
              async () => {
                await sleep(2000)
                return true
              },
              {
                name: `Generate tags`,
                description: `Generating tags...`,
              }
            )
            pageQueue.push(imageUrlTask)
            pageQueue.push(genrateImageTask)
            pageQueue.push(generateTagsTask)
            return pageQueue
          })
          queue.unshiftPatch(...pageTasks)
        }
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
        await sleep(2000)
        return true
      },
      {
        name: 'Generate xlsx',
        description: 'Generating xlsx...',
      }
    )
    const generateZipTask = new Task(
      async () => {
        await sleep(2000)
        return true
      },
      {
        name: 'Generate zip',
        description: 'Generating zip...',
      }
    )
    const downloadTask = new Task(
      async () => {
        await sleep(2000)
        return true
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
