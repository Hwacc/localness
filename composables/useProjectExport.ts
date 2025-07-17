import TaskQueue, { Task } from '~/libs/task-queue'

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
          if (bell === 'worker-ready') {
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
        const project = await useApi(
          `/api/project/export/${projectStore.curProject.id}`
        )
        const res = await worker.value?.postAsyncMessage({
          bell: 'set-data',
          payload: project,
        })
        console.log('main received ', res)
        return project
      },
      {
        id: 'request-project-data',
        name: 'Request Project Data',
        description: 'Request project data for export',
      }
    )

    queue.push(requestTask)
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
