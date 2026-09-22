import { omit } from 'lodash-es'
import { AlertModal, UAlert, UButton } from '#components'

export function useTranslationGenerator() {
  const toast = useToast()
  const pageStore = usePageStore()
  const projectStore = useProjectStore()
  const overlay = useOverlay()

  const alertModal = overlay.create(AlertModal, {
    props: {
      mode: 'warning',
      title: 'Warning',
      loading: false,
      slots: {
        body: () => {
          return (
            <div class="flex flex-col gap-3">
              <p>This translation already exists. Do you want to recover it?</p>
              <UAlert
                title="Warning"
                description="Create new translation may generate a repeating translation. Make sure to create it carefully."
                color="warning"
                variant="soft"
              />
            </div>
          )
        },
        footer: ({ close, emit, mode }) => {
          return (
            <div class="w-full flex items-center justify-end gap-2">
              <UButton
                label="Create New"
                color="neutral"
                variant="ghost"
                onClick={() => {
                  emit('cancel', mode, {
                    close: () => close(true),
                  })
                }}
              />
              <UButton
                label="Recover"
                color="warning"
                onClick={() => {
                  emit('ok', mode, {
                    close: () => close(true),
                  })
                }}
              />
            </div>
          )
        },
      },
    },
  })

  async function generateTranslation(
    trans: ITranslation,
    releaseIds?: number[]
  ) {
    if (!trans.origin) return null
    let checkedID: ID | null = null
    if (trans.fingerprint) {
      checkedID = await useApi<ID | null>(
        `/api/translation/check?fp=${trans.fingerprint}&projectId=${projectStore.curProject.id}`
      )
    }
    /*
     * Every "create a translation" path goes through here, and only the create
     * calls below may label it: the caller's choice when it has a picker, the
     * release being viewed when it does not. See the omit list for the recover
     * path, which posts the same object at an existing entry.
     */
    const viewedRelease = defaultReleaseIdForFilter(
      projectStore.curReleaseFilter
    )
    const labels = releaseIds ?? (viewedRelease ? [viewedRelease] : [])
    console.log('checked', trans, checkedID)
    return new Promise<ITranslation | null>((resolve) => {
      const cleanTrans = omit(trans, [
        'id',
        'fingerprint',
        'updatedAt',
        'createdAt',
        'releaseIds',
      ])
      if (checkedID) {
        // open ask modal
        alertModal.open()
        alertModal.patch({
          interceptCancel: true,
          onOk: async (_, { close }) => {
            // answer if recover existing translation
            try {
              alertModal.patch({ loading: true })
              // update existing translation
              const res = await useApi<ITranslation>(
                `/api/translation/${checkedID}`,
                {
                  method: 'POST',
                  body: cleanTrans,
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
            // answer if force create new translation
            try {
              alertModal.patch({ loading: true })
    const res = await useApi<ITranslation>(`/api/translation`, {
                method: 'POST',
                body: {
                  ...cleanTrans,
                  projectId: projectStore.curProject.id,
                  force: true,
                  releaseIds: labels,
                },
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
          onClose: (isOk) => {
            if (!isOk) resolve(null)
          },
        }) 
      } else {
        // create new Translation
        useApi<ITranslation>(`/api/translation`, {
          method: 'POST',
          body: {
            ...cleanTrans,
            projectId: projectStore.curProject.id,
            releaseIds: labels,
          },
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

  async function ocr({
    image,
    language = 'auto',
    releaseIds,
  }: {
    image: string
    language?: string
    releaseIds?: number[]
  }) {
    const lang = pageStore.curPage.settings?.ocrLanguage || language
    const ocrRes = await useApi<{
      text: string
      fingerprint: string
    } | null>(`/api/common/ocr`, {
      method: 'POST',
      body: { image, language: lang },
    })
    if (!ocrRes) {
      toast.add({
        title: 'Error',
        description: 'Failed to OCR image',
        icon: 'i-lucide:circle-x',
        color: 'error',
      })
      return
    }
    return await generateTranslation(
      {
        origin: ocrRes.text,
        fingerprint: ocrRes.fingerprint,
      } as ITranslation,
      releaseIds
    )
  }

  async function manual(translation: ITranslation, releaseIds?: number[]) {
    if (!translation.origin) return null
    return await generateTranslation(translation, releaseIds)
  }

  return { ocr, manual }
}
