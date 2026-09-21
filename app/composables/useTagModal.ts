import { TagInfoModal, TranslationLinkModal } from '#components'
import { isEmpty, map, pick } from 'lodash-es'

type TagModalOptions = {
  tag: ITag
  clip: string
  onSave?: (updatedTag: ITag | undefined) => void
  onCreateTranslation?: (updatedTag: ITag | undefined) => void
  onClose?: (isOK: boolean) => void
}

export function useTagModal() {
  const overlay = useOverlay()
  const tagModal = overlay.create(TagInfoModal, {
    props: {
      tag: {} as ITag,
      clip: '',
      suggestion: null,
      onSave: () => {},
      onCreateTrans: () => {},
      onClose: () => {},
    },
  })
  const transLinkModal = overlay.create(TranslationLinkModal, {
    props: {
      onSave: () => {},
      onClose: () => {},
    },
  })

  const projectStore = useProjectStore()
  const pageStore = usePageStore()
  const tagStore = useTagStore()
  const toast = useToast()
  const translationGenerator = useTranslationGenerator()

  function open(opt: TagModalOptions) {
    tagModal.open({
      tag: opt.tag,
      clip: opt.clip,
      loading: false,
      onSave: async ({ tag, settings, translation, isTransOriginChanged }) => {
        try {
          tagModal.patch({ loading: true })
          let updatedTrans: ITranslation | null = null
          if (translation) {
            // trans origin changed -> create new translation
            if (isTransOriginChanged) {
              updatedTrans = await translationGenerator.manual(
                translation as ITranslation
              )
            }
            // update translation content
            const contentPromises = map(
              pick(translation, ['vue', 'react']),
              (item, key) => {
                if (isEmpty(item)) return Promise.resolve()
                return useApi(
                  `/api/translation/${
                    updatedTrans ? updatedTrans.id : translation?.id
                  }/${key}`,
                  {
                    method: 'POST',
                    body: item,
                  }
                )
              }
            )
            await Promise.all(contentPromises)
          }
          const updatedTag = await tagStore.updateTag(
            opt.tag.id,
            updatedTrans
              ? {
                  ...tag,
                  settings,
                  translationID: updatedTrans.id,
                }
              : { ...tag, settings }
          )
          tagModal.patch({ tag: updatedTag })
          toast.add({
            title: 'Success',
            description: 'Tag updated',
            color: 'success',
            icon: 'i-lucide:check',
          })
          opt.onSave?.(updatedTag)
        } catch (error) {
          console.error('tag info error', error)
        } finally {
          tagModal.patch({ loading: false })
        }
      },
      onCreateTrans: async ({ type, translation }) => {
        try {
          tagModal.patch({ loading: true })
          const handleUpdateTag = async (
            trans: ITranslation | null | undefined
          ) => {
            if (trans && trans.id) {
              const updatedTag = await tagStore.updateTag(opt.tag.id, {
                translationID: trans.id,
                i18nKey: typeof trans.key === 'string' ? trans.key : undefined,
              })
              tagModal.patch({ tag: updatedTag })
              toast.add({
                title: 'Success',
                description:
                  type === 'link'
                    ? 'Translation linked'
                    : 'Translation created',
                color: 'success',
                icon: 'i-lucide:check',
              })
              opt.onCreateTranslation?.(updatedTag)
            } else {
              opt.onCreateTranslation?.(undefined)
            }
          }
          if (type === 'ocr') {
            // ocr -> create translation -> update tag
            const createdTrans = await translationGenerator.ocr({
              image: opt.clip,
            })
            await handleUpdateTag(createdTrans)
          } else if (type === 'link') {
            // link -> link a existing translation -> update tag
            transLinkModal.open({
              onSave: async (trans, { close }) => {
                await handleUpdateTag(trans)
                close()
              },
              onClose: (isOK: boolean) => {
                !isOK && handleUpdateTag(undefined)
              },
            })
          } else if (type === 'manual') {
            // manual -> create translation -> update tag
            const createdTrans = await translationGenerator.manual(
              translation as ITranslation
            )
            await handleUpdateTag(createdTrans)
          }
        } catch (error) {
          console.error('tag info error', error)
        } finally {
          tagModal.patch({ loading: false })
        }
      },

      onCreateI18nKey: async ({ id, origin, prompt }) => {
        tagModal.patch({ loading: true, suggestion: null })
        try {
          // Nothing is written here on purpose: the answer is a suggestion until
          // Save. Committing it now would create an `I18nKey` row for a key the
          // user may replace a second later, and leave the first one orphaned.
          tagModal.patch({
            suggestion: await requestKeySuggestion({
              tagID: id,
              origin,
              projectPrompt: projectStore.curProject.settings?.prompt,
              pagePrompt: pageStore.curPage.settings?.prompt,
              tagPrompt: prompt,
            }),
          })
        } catch (error) {
          console.error('gen i18n key error', error)
        } finally {
          tagModal.patch({ loading: false })
        }
      },
      onClose: (isOK: boolean) => {
        opt.onClose?.(isOK)
      },
    })
  }

  return { open }
}
