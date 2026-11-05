import { omit } from 'lodash-es'
import { DEFAULT_LOCALE_FALLBACK } from '#shared/constants'
import { AlertModal, UButton, UTooltip } from '#components'

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

  /**
   * The hit and the new text share a fingerprint, which ignores whitespace,
   * so they can still differ in spacing — an OCR read that glued words, say.
   * Null while the two match exactly.
   */
  const conflict = shallowRef<{
    existingText: string
    newText: string
    /** Published entries are read-only until reverted to draft. */
    editable: boolean
    update: () => void
  } | null>(null)

  const alertModal = overlay.create(AlertModal, {
    props: {
      mode: 'warning',
      title: 'Entry already exists',
      loading: false,
      slots: {
        body: () => {
          const diff = conflict.value
          return (
            <div class="flex flex-col gap-3">
              <p>
                {diff
                  ? 'This project already has an entry with the same text, ignoring whitespace. Use Existing links this tag to it instead of adding a duplicate.'
                  : 'This project already has an entry with this text. Use Existing links this tag to it instead of adding a duplicate.'}
              </p>
              {diff && (
                <div class="flex flex-col gap-2 text-sm">
                  <div>
                    <p class="text-xs text-muted">Existing</p>
                    <p class="font-mono break-words">{diff.existingText}</p>
                  </div>
                  <div>
                    <p class="text-xs text-muted">New</p>
                    <p class="font-mono break-words">{diff.newText}</p>
                  </div>
                </div>
              )}
            </div>
          )
        },
        footer: ({ close, emit, mode }) => {
          const diff = conflict.value
          return (
            <div class="w-full flex items-center justify-end gap-2">
              <UTooltip text="Add a second entry with the new text, leaving the existing one as it is. The project then holds two entries for the same text.">
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
              </UTooltip>
              {diff && (
                <UTooltip
                  text={
                    diff.editable
                      ? 'Link this tag to the existing entry and replace its source text with the new text.'
                      : 'The existing entry is published. Revert it to draft to change its text.'
                  }
                >
                  {/* A disabled button gets no pointer events; the span keeps the tooltip. */}
                  <span>
                    <UButton
                      label="Use Existing & Update"
                      color="warning"
                      variant="outline"
                      disabled={!diff.editable}
                      onClick={diff.update}
                    />
                  </span>
                </UTooltip>
              )}
              <UTooltip
                text={
                  diff
                    ? 'Link this tag to the existing entry and keep its current text.'
                    : 'Link this tag to the existing entry.'
                }
              >
                <UButton
                  label="Use Existing"
                  color="warning"
                  onClick={() => {
                    emit('ok', mode, {
                      close: () => close(true),
                    })
                  }}
                />
              </UTooltip>
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
        const existingText = sourceTextOf(existing)
        const newText = sourceTextOf(trans)
        conflict.value =
          existingText === newText
            ? null
            : {
                existingText,
                newText,
                editable: existing.dirty !== false,
                update: async () => {
                  try {
                    alertModal.patch({ loading: true })
                    const content = await useApi<TranslationContent>(
                      `/api/translation/${existing.id}/vue`,
                      {
                        method: 'POST',
                        body: { [sourceLocale.value]: newText },
                      }
                    )
                    resolve({ ...existing, vue: content, react: { ...content } })
                    alertModal.close(true)
                  } catch (error) {
                    console.error(error)
                  } finally {
                    alertModal.patch({ loading: false })
                  }
                },
              }
        // open ask modal
        alertModal.open()
        alertModal.patch({
          interceptCancel: true,
          /* Use Existing links, never writes: the entry already holds this text. */
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
