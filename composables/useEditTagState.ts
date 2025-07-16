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
} from '~/constants'
import type { ITag } from '~/types/Tag'

export const schema = z.object({
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
  i18nKey: z.string().optional(),
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
    locked: unref(tag).locked,
    style: {
      fill: unref(tag).style?.fill || '',
      stroke: (unref(tag).style?.stroke || DEFAULT_LINE_COLOR) as string,
      strokeWidth: unref(tag).style?.strokeWidth || DEFAULT_LINE_WIDTH,
      cornerRadius: unref(tag).style?.cornerRadius || DEFAULT_CORNER_RADIUS,
    },
    labelStyle: {
      fill: unref(tag).labelStyle?.fill || DEFAULT_LABEL_FILL,
      fontSize: unref(tag).labelStyle?.fontSize || DEFAULT_LABEL_FONT_SIZE,
      fontWeight:
        unref(tag).labelStyle?.fontWeight || DEFAULT_LABEL_FONT_WEIGHT,
      textWrap: unref(tag).labelStyle?.textWrap || DEFAULT_LABEL_WRAP,
      align: unref(tag).labelStyle?.align || DEFAULT_LABEL_ALIGN,
    },
    i18nKey: unref(tag).i18nKey || '',
    translation: unref(tag).translation
      ? cloneDeep(unref(tag).translation) ?? null
      : null,
  })

  watch(
    () => unref(tag),
    (val) => {
      state.locked = val.locked
      state.style = {
        fill: val.style?.fill || '',
        stroke: (val.style?.stroke || DEFAULT_LINE_COLOR) as string,
        strokeWidth: val.style?.strokeWidth || DEFAULT_LINE_WIDTH,
        cornerRadius: val.style?.cornerRadius || DEFAULT_CORNER_RADIUS,
      }
      state.i18nKey = val.i18nKey || ''
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
