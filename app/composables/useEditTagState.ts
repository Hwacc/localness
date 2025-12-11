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
  const state = reactive<ZTagState>({
    i18nKey: i18nKey ?? '',
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

  watch(
    () => unref(tag),
    (val) => {
      const { settings, i18nKey, translation } = val
      state.i18nKey = i18nKey ?? ''
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
        origin: translation?.origin ?? '',
        fingerprint: translation?.fingerprint ?? '',
        vue: translation?.vue ?? {},
        react: translation?.react ?? {},
      }
    }
  )

  return { state }
}
