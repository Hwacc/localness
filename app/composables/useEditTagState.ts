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

export const schema = z.object({
  i18nKey: z.string().optional(),
  settings: z.looseObject({
    locked: z.boolean(),
    style: z.object({
      fill: z.string().optional(),
      stroke: z.string().optional(),
      strokeWidth: z.number().optional(),
      cornerRadius: z.number().optional(),
    }),
    labelStyle: z.object({
      fill: z.string().optional(),
      fontSize: z.number().optional(),
      fontWeight: z.enum(['normal', 'bold']).optional(),
      textWrap: z.string().optional(),
      align: z
        .enum([
          'top-left',
          'top-right',
          'bottom-left',
          'bottom-right',
          'left',
          'right',
        ])
        .optional(),
    }),
    prompt: z.string().optional(),
  }),
  translation: z
    .object({
      origin: z.string().optional(),
      fingerprint: z.string().optional(),
      vue: zTranslationContent.nullable().optional(),
      react: zTranslationContent.nullable().optional(),
    })
    .nullable(),
})
export type Schema = z.infer<typeof schema>

export function useEditTagState(tag: MaybeRef<ITag>) {
  const state = reactive<Schema>({
    i18nKey: unref(tag).i18nKey || '',
    settings: {
      locked: unref(tag).settings?.locked ?? false,
      style: {
        fill: unref(tag).settings?.style?.fill || '',
        stroke: (unref(tag).settings?.style?.stroke ||
          DEFAULT_LINE_COLOR) as string,
        strokeWidth:
          unref(tag).settings?.style?.strokeWidth || DEFAULT_LINE_WIDTH,
        cornerRadius:
          unref(tag).settings?.style?.cornerRadius || DEFAULT_CORNER_RADIUS,
      },
      labelStyle: {
        fill: unref(tag).settings?.labelStyle?.fill || DEFAULT_LABEL_FILL,
        fontSize:
          unref(tag).settings?.labelStyle?.fontSize || DEFAULT_LABEL_FONT_SIZE,
        fontWeight:
          unref(tag).settings?.labelStyle?.fontWeight ||
          DEFAULT_LABEL_FONT_WEIGHT,
        textWrap: unref(tag).settings?.labelStyle?.textWrap || DEFAULT_LABEL_WRAP,
        align: unref(tag).settings?.labelStyle?.align || DEFAULT_LABEL_ALIGN,
      },
      prompt: unref(tag).settings?.prompt || '',
    },
    translation: unref(tag).translation
      ? cloneDeep(unref(tag).translation) ?? null
      : null,
  })

  watch(
    () => unref(tag),
    (val) => {
      const settings = val.settings
      state.i18nKey = val.i18nKey || ''
      state.settings = {
        locked: settings?.locked ?? false,
        style: {
          fill: settings?.style?.fill || '',
          stroke: (settings?.style?.stroke || DEFAULT_LINE_COLOR) as string,
          strokeWidth: settings?.style?.strokeWidth || DEFAULT_LINE_WIDTH,
          cornerRadius: settings?.style?.cornerRadius || DEFAULT_CORNER_RADIUS,
        },
        labelStyle: {
          fill: settings?.labelStyle?.fill || DEFAULT_LABEL_FILL,
          fontSize:
            settings?.labelStyle?.fontSize || DEFAULT_LABEL_FONT_SIZE,
          fontWeight:
            settings?.labelStyle?.fontWeight || DEFAULT_LABEL_FONT_WEIGHT,
          textWrap: settings?.labelStyle?.textWrap || DEFAULT_LABEL_WRAP,
          align: settings?.labelStyle?.align || DEFAULT_LABEL_ALIGN,
        },
        prompt: settings?.prompt || '',
      }
      state.translation = {
        origin: val.translation?.origin || '',
        fingerprint: val.translation?.fingerprint || '',
        vue: val.translation?.vue || {},
        react: val.translation?.react || {},
      }
    }
  )

  return { state }
}
