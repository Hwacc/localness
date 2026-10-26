import { z } from 'zod/v4'
import { OCR_LANGUAGES } from '#shared/constants'
import { KEY_STYLE_VALUES } from '#shared/utils/key-convention'
import { zNilable } from './common'

export const zPage = z.object({
  name: z.string().min(3),
  image: z.string(),
  settings: z.object({
    ocrLanguage: z.string(),
    ocrEngine: z.number(),
    prompt: zNilable(z.string()),
    // Nilable, unlike the project's: on a page `null` means "inherit", and the
    // form writes all four or leaves all four alone.
    keyPrefix: zNilable(z.string()),
    keySeparator: zNilable(z.string().min(1, 'separator cannot be empty')),
    keyStyle: zNilable(z.enum(KEY_STYLE_VALUES)),
    keyMaxDepth: zNilable(z.number().int().min(1).max(10)),
  }),
  /** Release labels to attach. Omitted leaves them untouched on update. */
  releaseIds: z.array(z.number().int().positive()).optional(),
})
export type ZPage = z.infer<typeof zPage>

export const zPageSetting = z.object(
  {
    ocrLanguage: zNilable(
      z.string().refine((v) => OCR_LANGUAGES.some((l) => l.value === v), {
        message: `language must be one of ${OCR_LANGUAGES.map(
          (l) => l.value
        ).join(', ')}`,
      })
    ),
    ocrEngine: zNilable(
      z.number().refine((v) => v === 1 || v === 2, {
        message: 'ocrEngine must be 1 or 2',
      })
    ),
    prompt: zNilable(z.string()),
    keyPrefix: zNilable(z.string()),
    keySeparator: zNilable(z.string().min(1, 'separator cannot be empty')),
    keyStyle: zNilable(z.enum(KEY_STYLE_VALUES)),
    keyMaxDepth: zNilable(z.number().int().min(1).max(10)),
  },
  'Page setting parameters validate failed'
)
export type ZPageSetting = z.infer<typeof zPageSetting>

export const zTagSetting = z.object(
  {
    locked: z.boolean(),
    style: z.any(),
    labelStyle: z.any(),
    prompt: zNilable(z.string()),
  },
  'Tag setting parameters validate failed'
)
export type ZTagSetting = z.infer<typeof zTagSetting>

export const zTag = z.object(
  {
    pageID: z.number().nonnegative(),
    tagID: z.string(),
    className: z.string(),
    width: z.number().nonnegative(),
    height: z.number().nonnegative(),
    x: z.number().nonnegative(),
    y: z.number().nonnegative(),
    i18nKey: zNilable(z.string()),
    translationID: zNilable(z.number().nonnegative()),
    i18nKeyId: zNilable(z.number().nonnegative()),
    /** Labels for the key this tag is bound to. Omitted leaves them untouched. */
    releaseIds: z.array(z.number().int().positive()).optional(),
    settings: zTagSetting.optional(),
  },
  'Tag parameters validate failed'
)
export type ZTag = z.infer<typeof zTag>
