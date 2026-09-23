import { cloneDeep } from 'lodash-es'
import z from 'zod/v4'
import {
  DEFAULT_CORNER_RADIUS,
  DEFAULT_LABEL_ALIGN,
  DEFAULT_LABEL_FILL,
  DEFAULT_LABEL_FONT_SIZE,
  DEFAULT_LABEL_FONT_WEIGHT,
  DEFAULT_LABEL_WRAP,
  DEFAULT_LINE_COLOR,
  DEFAULT_LINE_WIDTH,
} from '#shared/constants'

// tag editable schema
export const zTagState = z.object({
  i18nKey: z.string(),
  /** Labels belong to the bound key, but the tag save is the write that owns them. */
  releaseIds: z.array(z.number()).optional(),
  settings: z.looseObject({
    locked: z.boolean(),
    style: z.object({
      fill: z.string(),
      stroke: z.string(),
      strokeWidth: z.number(),
      cornerRadius: z.number(),
    }),
    labelStyle: z.object({
      fill: z.string(),
      fontSize: z.number(),
      fontWeight: z.enum(['normal', 'bold']),
      textWrap: z.string(),
      align: z.enum([
        'top-left',
        'top-right',
        'bottom-left',
        'bottom-right',
        'left',
        'right',
      ]),
    }),
    prompt: z.string(),
  }),
  translation: zTranslation,
})
export type ZTagState = z.infer<typeof zTagState>

export function useEditTagState(tag: MaybeRef<ITag>) {
  const { i18nKey, settings, translation } = unref(tag)
  const projectStore = useProjectStore()

  /**
   * The key's own labels, or the release being viewed while there is no key yet —
   * the same default a new page and a new translation get. Seeding from the key
   * rather than the filter is what keeps a save from relabelling an entry that
   * someone already filed.
   */
  function seedReleaseIds(src: ITag): number[] {
    if (validID(src.translationID)) {
      return (src.translation?.releaseIds ?? []).map(Number)
    }
    const defaultId = defaultReleaseIdForFilter(projectStore.curReleaseFilter)
    return defaultId ? [defaultId] : []
  }

  const state = reactive<ZTagState>({
    i18nKey: i18nKey ?? '',
    releaseIds: seedReleaseIds(unref(tag)),
    settings: {
      locked: settings?.locked ?? false,
      style: {
        fill: settings?.style?.fill ?? '',
        stroke: (settings?.style?.stroke ?? DEFAULT_LINE_COLOR) as string,
        strokeWidth: settings?.style?.strokeWidth ?? DEFAULT_LINE_WIDTH,
        cornerRadius: settings?.style?.cornerRadius ?? DEFAULT_CORNER_RADIUS,
      },
      labelStyle: {
        fill: settings?.labelStyle?.fill ?? DEFAULT_LABEL_FILL,
        fontSize: settings?.labelStyle?.fontSize ?? DEFAULT_LABEL_FONT_SIZE,
        fontWeight:
          settings?.labelStyle?.fontWeight ?? DEFAULT_LABEL_FONT_WEIGHT,
        textWrap: settings?.labelStyle?.textWrap ?? DEFAULT_LABEL_WRAP,
        align: settings?.labelStyle?.align ?? DEFAULT_LABEL_ALIGN,
      },
      prompt: settings?.prompt ?? '',
    },
    translation: cloneDeep(translation) ?? {},
  })

  /** What the selector was seeded with, so a save can tell "edited" from "untouched". */
  const seededReleaseIds = ref<number[]>([...(state.releaseIds ?? [])])

  watch(
    () => unref(tag),
    (val) => {

      console.log('watch tag', val)
      const { settings, i18nKey, translation } = val
      state.i18nKey = i18nKey ?? ''
      state.releaseIds = seedReleaseIds(val)
      seededReleaseIds.value = [...state.releaseIds]
      state.settings = {
        locked: settings?.locked ?? false,
        style: {
          fill: settings?.style?.fill ?? '',
          stroke: (settings?.style?.stroke ?? DEFAULT_LINE_COLOR) as string,
          strokeWidth: settings?.style?.strokeWidth ?? DEFAULT_LINE_WIDTH,
          cornerRadius: settings?.style?.cornerRadius ?? DEFAULT_CORNER_RADIUS,
        },
        labelStyle: {
          fill: settings?.labelStyle?.fill ?? DEFAULT_LABEL_FILL,
          fontSize: settings?.labelStyle?.fontSize ?? DEFAULT_LABEL_FONT_SIZE,
          fontWeight:
            settings?.labelStyle?.fontWeight ?? DEFAULT_LABEL_FONT_WEIGHT,
          textWrap: settings?.labelStyle?.textWrap ?? DEFAULT_LABEL_WRAP,
          align: settings?.labelStyle?.align ?? DEFAULT_LABEL_ALIGN,
        },
        prompt: settings?.prompt ?? '',
      }
      state.translation = {
        fingerprint: translation?.fingerprint ?? '',
        vue: translation?.vue ?? {},
        react: translation?.react ?? {},
      }
    }
  )

  return { state, seededReleaseIds }
}
