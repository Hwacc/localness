import { TagInfoModal, TranslationLinkModal } from '#components'
import { isEmpty, map, pick } from 'lodash-es'

type TagModalOptions = {
  tag: ITag
  clip: string
  onSave?: (updatedTag: ITag | undefined) => void
  onCreateTranslation?: (updatedTag: ITag | undefined) => void
  onCreateI18nKey?: (updatedTag: ITag | undefined) => void
  onClose?: (isOK: boolean) => void
}

export function useTagModal() {
  const overlay = useOverlay()
  const tagModal = overlay.create(TagInfoModal, {
    props: {
      tag: {} as ITag,
      clip: '',
      onSave: () => {},
      onCreateTrans: () => {},
      onCreateI18nKey: () => {},
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
              onSave: async (trans) => {
                await handleUpdateTag(trans)
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

      onCreateI18nKey: async ({ id, origin, i18nKey, prompt }) => {
        try {
          tagModal.patch({ loading: true })
          const result = await useApi<{ tagID: ID; i18nKey: string } | null>(
            '/api/tag/ai/gen-i18n-key',
            {
              method: 'POST',
              body: {
                projectPrompt: projectStore.curProject.settings?.prompt,
                pagePrompt: pageStore.curPage.settings?.prompt,
                tagID: id,
                tagOrigin: origin,
                tagI18nKey: i18nKey,
                tagPrompt: prompt,
              },
            }
          )
          if (result) {
            const updatedTag = await tagStore.updateTag(result.tagID, {
              i18nKey: result.i18nKey,
            })
            tagModal.patch({
              tag: updatedTag,
            })
            toast.add({
              title: 'Success',
              description: 'Tag updated',
              color: 'success',
              icon: 'i-lucide:check',
            })
            opt.onCreateI18nKey?.(updatedTag)
          } else {
            opt.onCreateI18nKey?.(undefined)
          }
        } catch (error) {
          console.error('tag info error', error)
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
