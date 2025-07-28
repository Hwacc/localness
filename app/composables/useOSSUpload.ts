import * as qiniu from 'qiniu-js'
import { OSSEngine } from '#shared/constants'

interface UploadResult {
  key: string
  fsize: number
  name: string
  bucket?: string
  hash?: string
}

export function useOSSUpload() {
  const toast = useToast()
  const { ossEngine } = useRuntimeConfig().public

  async function upload(file: File, token: string): Promise<UploadResult> {
    if (ossEngine === OSSEngine.QINIU) {
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
            timestampFilename(file),
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
              if (import.meta.client) {
                toast.add({
                  title: 'Error',
                  description: 'Failed to upload image',
                  icon: 'i-lucide:circle-x',
                  color: 'error',
                })
              }
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
      try {
        const res = await $fetch<string[]>('/api/common/upload-file', {
          method: 'POST',
          body: form,
        })
        if (!res || res.length === 0) {
          toast.add({
            title: 'Error',
            description: 'Failed to upload image',
            icon: 'i-lucide:circle-x',
            color: 'error',
          })
          throw new Error('Failed to upload image')
        }
        console.log('upload complete', res)
        return {
          key: res[0],
          fsize: file.size,
          name: file.name,
        }
      } catch (error) {
        console.error('upload error', error)
        toast.add({
          title: 'Error',
          description: 'Failed to upload image',
          icon: 'i-lucide:circle-x',
          color: 'error',
        })
        throw new Error('Failed to upload image')
      }
    }
    return Promise.reject(new Error('Unsupported OSS engine'))
  }
  return { upload }
}
