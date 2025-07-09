import { AlertModal } from '#components'
import type { ID } from '~/types/global'
import type { ITranslation } from '~/types/Translation'
import SparkMD5 from 'spark-md5'

export function useTranslationGenerator() {
  const pageStore = usePageStore()
  const overlay = useOverlay()

  const alertModal = overlay.create(AlertModal, {
    props: {
      mode: 'warning',
      title: 'Warning',
      message: 'This translation already exists. Do you want to recover it?',
      okText: 'Recover',
      cancelText: 'Create New',
      loading: false,
    },
  })

  async function ocr({
    image,
    language = 'auto',
  }: {
    image: string
    language?: string
  }) {
    const lang = pageStore.curPage.settings?.ocrLanguage || language
    const ocrRes = await useApi<{
      text: string
      md5: string
    } | null>(`/api/common/ocr`, {
      method: 'POST',
      body: { image, language: lang },
    })

    if (!ocrRes) return
    // check
    const transID = await useApi<ID | null>(
      `/api/translation/check?md5=${ocrRes.md5}`
    )

    return new Promise<ITranslation | null>((resolve) => {
      if (transID) {
        // open ask modal
        alertModal.patch({
          interceptCancel: true,
          onOk: async (_, { close }) => {
            try {
              alertModal.patch({ loading: true })
              const res = await useApi<ITranslation>(
                `/api/translation/${transID}`,
                {
                  method: 'POST',
                  body: { origin: ocrRes.text },
                }
              )
              resolve(res)
              close()
            } catch (error) {
              console.error(error)
              resolve(null)
            } finally {
              alertModal.patch({ loading: false })
            }
          },
          onCancel: async (_, { close }) => {
            try {
              alertModal.patch({ loading: true })
              const newMD5 = SparkMD5.hash(ocrRes.text + new Date().getTime())
              const res = await useApi<ITranslation>(`/api/translation`, {
                method: 'POST',
                body: { origin: ocrRes.text, md5: newMD5 },
              })
              resolve(res)
              close()
            } catch (error) {
              console.error(error)
              resolve(null)
            } finally {
              alertModal.patch({ loading: false })
            }
          },
          onClose: (success) => {
            if (!success) resolve(null)
          },
        })
        alertModal.open()
      } else {
        // create new Translation
        useApi<ITranslation>(`/api/translation`, {
          method: 'POST',
          body: { origin: ocrRes.text },
        })
          .then((res) => {
            resolve(res)
          })
          .catch((error) => {
            console.error(error)
            resolve(null)
          })
      }
    })
  }

  return { ocr }
}
