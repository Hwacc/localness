import { z } from 'zod/v4'
import { OCR_LANGUAGES } from '#shared/constants'

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

export const zTag = z.object(
  {
    pageID: z.number().nonnegative(),
    tagID: z.string(),
    className: z.string(),
    width: z.number().nonnegative(),
    height: z.number().nonnegative(),
    x: z.number().nonnegative(),
    y: z.number().nonnegative(),
    locked: z.boolean(),
    style: z.any(),
    labelStyle: z.any(),
    i18nKey: z.string().nullable().optional(),
    translationID: z.number().nonnegative().nullable().optional(),
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
    language: z
      .string()
      .optional()
      .refine((v) => OCR_LANGUAGES.some((l) => l.value === v), {
        message: `language must be one of ${OCR_LANGUAGES.map(
          (l) => l.value
        ).join(', ')}`,
      }),
  },
  'OCR parameters validate failed'
)
export type ZOCR = z.infer<typeof zOCR>

export const zProjectSetting = z.object(
  {
    ocrLanguage: z
      .string()
      .optional()
      .refine((v) => OCR_LANGUAGES.some((l) => l.value === v), {
        message: `language must be one of ${OCR_LANGUAGES.map(
          (l) => l.value
        ).join(', ')}`,
      }),
    ocrEngine: z
      .number()
      .optional()
      .refine((v) => v === 1 || v === 2, {
        message: 'ocrEngine must be 1 or 2',
      }),
  },
  'Project setting parameters validate failed'
)
export type ZProjectSetting = z.infer<typeof zProjectSetting>

export const zPageSetting = z.object(
  {
    ocrLanguage: z
      .string()
      .optional()
      .refine((v) => OCR_LANGUAGES.some((l) => l.value === v), {
        message: `language must be one of ${OCR_LANGUAGES.map(
          (l) => l.value
        ).join(', ')}`,
      }),
    ocrEngine: z
      .number()
      .optional()
      .refine((v) => v === 1 || v === 2, {
        message: 'ocrEngine must be 1 or 2',
      }),
  },
  'Page setting parameters validate failed'
)
export type ZPageSetting = z.infer<typeof zPageSetting>

export const zTranslationContent = z.looseObject({
  en: z.string().nullable().optional(),
  zh_cn: z.string().nullable().optional(),
  zh_tw: z.string().nullable().optional(),
  ja: z.string().nullable().optional(),
  ko: z.string().nullable().optional(),
  ru: z.string().nullable().optional(),
  fr: z.string().nullable().optional(),
  de: z.string().nullable().optional(),
  es: z.string().nullable().optional(),
  pt: z.string().nullable().optional(),
})
export type ZTranslationContent = z.infer<typeof zTranslationContent>

export const zTranslation = z.looseObject({
  origin: z.string().nullable().optional(),
  fingerprint: z.string().nullable().optional(),
  vue: zTranslationContent.nullable().optional(),
  react: zTranslationContent.nullable().optional(),
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
