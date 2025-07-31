import { z } from 'zod/v4'
import { OCR_LANGUAGES } from '#shared/constants'

export const zNilable = z.union([z.null(), z.undefined()])

export const PASSWORD_REGEX = /^(?=.*[a-zA-Z])(?=.*\d)[a-zA-Z\d_]*$/
export const zPassword = z
  .string()
  .max(16)
  .min(6)
  .regex(
    PASSWORD_REGEX,
    'Password must be at least 6 characters long and contain at least one letter and one number'
  )
export type ZPassword = z.infer<typeof zPassword>

export const zProject = z.object({
  name: z.string().min(3),
  description: zNilable.or(z.string()),
  settings: z.object({
    ocrLanguage: z.string(),
    ocrEngine: z.number(),
    prompt: zNilable.or(z.string()),
  }),
})
export type ZProject = z.infer<typeof zProject>

export const zPage = z.object({
  name: z.string().min(3),
  image: z.string(),
  settings: z.object({
    ocrLanguage: z.string(),
    ocrEngine: z.number(),
    prompt: zNilable.or(z.string()),
  }),
})
export type ZPage = z.infer<typeof zPage>

export const zTagSetting = z.object(
  {
    locked: z.boolean(),
    style: z.any(),
    labelStyle: z.any(),
    prompt: zNilable.or(z.string()),
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
    i18nKey: zNilable.or(z.string()),
    translationID: zNilable.or(z.number().nonnegative()),
    settings: zTagSetting.optional(),
  },
  'Tag parameters validate failed'
)
export type ZTag = z.infer<typeof zTag>

export const zID = z.union(
  [z.int().gt(0), z.string().min(1)],
  'ID must be a positive integer or a string'
)
export type ZID = z.infer<typeof zID>

export const zOCR = z.object(
  {
    image: z.string().nonempty(),
    language: zNilable.or(
      z.string().refine((v) => OCR_LANGUAGES.some((l) => l.value === v), {
        message: `language must be one of ${OCR_LANGUAGES.map(
          (l) => l.value
        ).join(', ')}`,
      })
    ),
  },
  'OCR parameters validate failed'
)
export type ZOCR = z.infer<typeof zOCR>

export const zProjectSetting = z.object(
  {
    ocrLanguage: zNilable.or(
      z.string().refine((v) => OCR_LANGUAGES.some((l) => l.value === v), {
        message: `language must be one of ${OCR_LANGUAGES.map(
          (l) => l.value
        ).join(', ')}`,
      })
    ),
    ocrEngine: zNilable.or(
      z.number().refine((v) => v === 1 || v === 2, {
        message: 'ocrEngine must be 1 or 2',
      })
    ),
    prompt: zNilable.or(z.string()),
  },
  'Project setting parameters validate failed'
)
export type ZProjectSetting = z.infer<typeof zProjectSetting>

export const zPageSetting = z.object(
  {
    ocrLanguage: zNilable.or(
      z.string().refine((v) => OCR_LANGUAGES.some((l) => l.value === v), {
        message: `language must be one of ${OCR_LANGUAGES.map(
          (l) => l.value
        ).join(', ')}`,
      })
    ),
    ocrEngine: zNilable.or(
      z.number().refine((v) => v === 1 || v === 2, {
        message: 'ocrEngine must be 1 or 2',
      })
    ),
    prompt: zNilable.or(z.string()),
  },
  'Page setting parameters validate failed'
)
export type ZPageSetting = z.infer<typeof zPageSetting>

export const zTranslationContent = z.looseObject({
  en: zNilable.or(z.string()),
  zh_cn: zNilable.or(z.string()),
  zh_tw: zNilable.or(z.string()),
  ja: zNilable.or(z.string()),
  ko: zNilable.or(z.string()),
  ru: zNilable.or(z.string()),
  fr: zNilable.or(z.string()),
  de: zNilable.or(z.string()),
  es: zNilable.or(z.string()),
  pt: zNilable.or(z.string()),
})
export type ZTranslationContent = z.infer<typeof zTranslationContent>

export const zTranslation = z.looseObject({
  origin: zNilable.or(z.string()),
  fingerprint: zNilable.or(z.string()),
  vue: zNilable.or(zTranslationContent),
  react: zNilable.or(zTranslationContent),
})
export type ZTranslation = z.infer<typeof zTranslation>

export const zExport = z.object(
  {
    pages: z.array(z.string()),
    fileFormat: z.array(
      z.string().refine((v) => v === 'xlsx' || v === 'json', {
        message: 'fileFormat must be xlsx or json',
      })
    ),
    i18nKey: z.boolean(),
    dateRange: z.object({
      start: z.iso.datetime().optional(),
      end: z.iso.datetime().optional(),
    }),
  },
  'Export parameters validate failed'
)
export type ZExport = z.infer<typeof zExport>

export const zGenI18nKey = z.object({
  projectPrompt: zNilable.or(z.string()),
  pagePrompt: zNilable.or(z.string()),
  pageImage: zNilable.or(z.string()),
  tagID: z.number().nonnegative(),
  tagOrigin: z.string(),
  tagI18nKey: zNilable.or(z.string()),
  tagPrompt: zNilable.or(z.string()),
})
export type ZGenI18nKey = z.infer<typeof zGenI18nKey>
