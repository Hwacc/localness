import z from 'zod/v4'
import {
  DEFAULT_CORNER_RADIUS,
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
  i18nKey: z.string().optional(),
  translation: z.object({
    origin: z.string().optional(),
    fingerprint: z.string().optional(),
    vue: zTranslationContent.optional(),
    react: zTranslationContent.optional(),
  }),
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
    i18nKey: unref(tag).i18nKey || '',
    translation: {
      origin: unref(tag).translation?.origin || '',
      fingerprint: unref(tag).translation?.fingerprint || '',
      vue: unref(tag).translation?.vue || {},
      react: unref(tag).translation?.react || {},
    },
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
