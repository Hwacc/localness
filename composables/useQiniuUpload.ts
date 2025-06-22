import * as qiniu from 'qiniu-js'

export const useQiniuUpload = async (file: File, token: string) => {
  const toast = useToast()
  console.log('before upload', file)
  /**
   * key: null use file hash
   * region.z2: 华南
   */
  return new Promise((resolve, reject) => {
    qiniu
      .upload(
        file,
        hashFilename(file),
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
        next(res) {
          console.log('upload next', res)
        },
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
          console.log('upload complete', res)
          resolve(res)
        },
      })
  })
}
