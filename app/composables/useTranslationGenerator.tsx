import { omit } from 'lodash-es'
import { DEFAULT_LOCALE_FALLBACK } from '#shared/constants'
import { AlertModal, UAlert, UButton } from '#components'

export function useTranslationGenerator() {
  const toast = useToast()
  const pageStore = usePageStore()
  const projectStore = useProjectStore()
  const overlay = useOverlay()

  /** A key's original text is its source language's entry, never a field beside it. */
  const sourceLocale = computed(
    () =>
      projectStore.curProject?.settings?.localeFallback ||
      DEFAULT_LOCALE_FALLBACK
  )

  function sourceTextOf(trans: ITranslation) {
    return String((trans.vue ?? trans.react)?.[sourceLocale.value] ?? '').trim()
  }

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
    if (!sourceTextOf(trans)) return null
    /* A hit is the entry holding this text, so the whole entry comes back. */
    const existing = trans.fingerprint
      ? await useApi<ITranslation | null>(
          `/api/translation/check?fp=${trans.fingerprint}&projectId=${projectStore.curProject.id}`
        )
      : null
    /*
     * Every "create a translation" path goes through here, and only the create
     * calls below may label it: the caller's choice when it has a picker, the
     * release being viewed when it does not.
     */
    const viewedRelease = defaultReleaseIdForFilter(
      projectStore.curReleaseFilter
    )
    const labels = releaseIds ?? (viewedRelease ? [viewedRelease] : [])
    return new Promise<ITranslation | null>((resolve) => {
      const cleanTrans = omit(trans, [
        'id',
        'fingerprint',
        'updatedAt',
        'createdAt',
        'releaseIds',
      ])
      if (existing) {
        // open ask modal
        alertModal.open()
        alertModal.patch({
          interceptCancel: true,
          /* Recover links, never writes: the entry already holds this text. */
          onOk: (_, { close }) => {
            resolve(existing)
            close()
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
        vue: { [sourceLocale.value]: ocrRes.text },
        fingerprint: ocrRes.fingerprint,
      } as ITranslation,
      releaseIds
    )
  }

  async function manual(translation: ITranslation, releaseIds?: number[]) {
    return await generateTranslation(translation, releaseIds)
  }

  return { ocr, manual }
}
