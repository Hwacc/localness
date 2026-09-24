import { TagInfoModal, TranslationLinkModal } from '#components'
import { isEmpty } from 'lodash-es'

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
      onSave: async ({ tag, settings, translation }) => {
        try {
          tagModal.patch({ loading: true })
          /*
           * A published entry's text is read-only server-side, and a rejection
           * here would take the whole save down with it — style, lock, prompt and
           * labels included. The dialog disables those fields in that state, so
           * there is nothing to write and the rest of the save goes through.
           */
          const textEditable = translation?.dirty !== false
          if (translation && textEditable) {
            /*
             * Written onto the entry this tag is already bound to, source language
             * included: a key's identity is its key string, so rewriting its
             * original text is an edit, not a different entry. `New` is the
             * explicit way to spin a separate one off.
             *
             * One request, not one per framework copy: `vue` and `react` hold the
             * same locale set and the endpoint writes that set either way, so a
             * second POST only raced the first. The dialog keeps both copies in
             * step, which is what makes reading one of them enough.
             */
            const content = translation.vue ?? translation.react
            if (!isEmpty(content)) {
              await useApi(`/api/translation/${translation.id}/vue`, {
                method: 'POST',
                body: content,
              })
            }
          }
          const updatedTag = await tagStore.updateTag(opt.tag.id, {
            ...tag,
            settings,
          })
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
      onCreateTrans: async ({ type, translation, releaseIds }) => {
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
              releaseIds,
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
              translation as ITranslation,
              releaseIds
            )
            await handleUpdateTag(createdTrans)
          }
        } catch (error) {
          console.error('tag info error', error)
        } finally {
          tagModal.patch({ loading: false })
        }
      },

      onCreateI18nKey: async ({ id, sourceText, prompt }) => {
        tagModal.patch({ loading: true, suggestion: null })
        try {
          // Nothing is written here on purpose: the answer is a suggestion until
          // Save. Committing it now would create an `I18nKey` row for a key the
          // user may replace a second later, and leave the first one orphaned.
          tagModal.patch({
            suggestion: await requestKeySuggestion({
              tagID: id,
              sourceText,
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
      /*
       * A revert to draft happens inside the dialog (it owns the confirmation and
       * the call), so all that is left here is to pick up the entry's new state —
       * otherwise reopening the dialog would still call it published.
       */
      onReverted: async () => {
        const refreshed = await tagStore.refreshTag(opt.tag.id)
        if (refreshed) {
          tagModal.patch({ tag: refreshed })
          opt.onSave?.(refreshed)
        }
      },
      onClose: (isOK: boolean) => {
        opt.onClose?.(isOK)
      },
    })
  }

  return { open }
}
