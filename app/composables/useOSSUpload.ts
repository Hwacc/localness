import * as qiniu from 'qiniu-js'
import { OSSEngine } from '#shared/constants'
import { timestampFilename } from '#shared/utils'

interface UploadResult {
  key: string
  fsize: number
  name: string
  bucket?: string
  hash?: string
}

function failToast(
  toast: ReturnType<typeof useToast>,
  description: string
) {
  if (!import.meta.client) return
  toast.add({
    title: 'Error',
    description,
    icon: 'i-lucide:circle-x',
    color: 'error',
  })
}

export function useOSSUpload() {
  const toast = useToast()
  const { ossEngine } = useRuntimeConfig().public

  async function upload(
    file: File,
    objectKey?: string
  ): Promise<UploadResult> {
    const storedKey = objectKey || timestampFilename(file)
    if (ossEngine === OSSEngine.QINIU) {
      const token = await useApi<string>('/upload/token')
      if (!token) {
        throw new Error('Failed to get upload token')
      }
      /**
       * key: null use file hash
       * region.z2: 华南
       */
      return new Promise<{
        key: string
        hash: string
        fsize: number
        bucket: string
        name: string
      }>((resolve, reject) => {
        qiniu
          .upload(
            file,
            storedKey,
            token,
            {
              customVars: {
                'x:name': file.name,
              },
            },
            {
              useCdnDomain: true,
              region: qiniu.region.z2,
            }
          )
          .subscribe({
            error(err) {
              console.error('upload error', err)
              failToast(toast, 'Failed to upload file')
              reject(err)
            },
            complete(res) {
              resolve(res)
            },
          })
      })
    }

    if (ossEngine === OSSEngine.LOCAL) {
      const form = new FormData()
      form.append('file', file)
      if (objectKey) form.append('key', objectKey)
      try {
        const res = await $fetch<string[]>('/upload', {
          method: 'POST',
          body: form,
        })
        if (!res || res.length === 0) {
          failToast(toast, 'Failed to upload file')
          throw new Error('Failed to upload file')
        }
        return {
          key: res[0]!,
          fsize: file.size,
          name: file.name,
        }
      } catch (error) {
        console.error('upload error', error)
        failToast(toast, 'Failed to upload file')
        throw new Error('Failed to upload file', { cause: error })
      }
    }
    return Promise.reject(new Error('Unsupported OSS engine'))
  }
  return { upload }
}
