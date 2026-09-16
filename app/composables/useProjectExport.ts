import { isEmpty } from 'lodash-es'
import JSZip from 'jszip'
import {
  buildExportJson,
  serializeExportJson,
  type ExportJsonSourceRow,
} from '#shared/utils/export-json'
import { exportBundleName } from '#shared/utils/file'
import { releaseNameForExport } from '#shared/utils/release'
import { ExportWorkerBells } from '~/assets/workers/export/types'
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
  const ossImage = useOSSImage()

  if (import.meta.client) {
    import('~/assets/workers/export/index.ts?worker')
      .then((res) => {
        worker.value = new res.default() as WorkerEx
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

  function exportProject(params: ZExport) {
    const wantsXlsx = params.fileFormat.includes('xlsx')
    const wantsJson = params.fileFormat.includes('json')
    /*
     * The worker is for canvas and xlsx encoding. JSON is string assembly, so it
     * must not wait for the worker to boot.
     */
    if (wantsXlsx && !ready.value) return null
    /* Read once at the start: the filter can change mid-export. */
    const releaseName = releaseNameForExport(
      projectStore.curReleaseFilter,
      projectStore.curReleases,
    )
    const queue = new TaskQueue({
      concurrency: 1,
      explosive: true,
    })

    const requestTask = new Task(
      async (_, context) => {
        const project = await useApi<
          IProject & { rows?: unknown[]; localeColumns?: string[] }
        >(`/api/project/export/${projectStore.curProject.id}`, {
          method: 'POST',
          body: params,
        })
        context.project = project
        context.rows = project.rows ?? []
        context.localeColumns = project.localeColumns ?? []
        if (wantsXlsx && !isEmpty(project.pages)) {
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
        // Rows come from the server: it owns the row rules (one row per tag,
        // a pic-less row for a key with no tag, published text only).
        const res = await worker.value?.postAsyncMessage({
          bell: ExportWorkerBells.GENERATE_XLSX,
          payload: {
            rows: context.rows,
            localeColumns: context.localeColumns,
          },
        })
        context.xlsx = res.data
        return { status: 'ok' }
      },
      {
        name: 'Generate xlsx',
        description: 'Generating xlsx...',
      }
    )
    const generateJsonTask = new Task(
      async (_, context) => {
        /* Built here, not in the worker: same rows as the sheet, so the two formats cannot disagree. */
        context.jsonFiles = buildExportJson({
          rows: context.rows as ExportJsonSourceRow[],
          localeColumns: context.localeColumns as string[],
        }).map((file) => ({
          name: `${file.locale}.json`,
          data: new Blob([serializeExportJson(file)], {
            type: 'application/json',
          }),
        }))
        return { status: 'ok' }
      },
      {
        name: 'Generate JSON',
        description: 'Generating JSON...',
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
        const bundleName = exportBundleName({
          projectName: context.project.name,
          releaseName,
        })
        // Named like the zip, so extracting two releases cannot collide on the sheet.
        context.xlsx && zip.file(`${bundleName}.xlsx`, context.xlsx)
        context.jsonFiles?.forEach(
          (file: { name: string; data: Blob }) => zip.file(file.name, file.data)
        )
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
        a.download = `${exportBundleName({
          projectName: context.project.name,
          releaseName,
        })}.zip`
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
    // Only what was asked for: JSON skips the screenshot pass and the sheet.
    if (wantsXlsx) queue.push(generateXlsxTask)
    if (wantsJson) queue.push(generateJsonTask)
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
