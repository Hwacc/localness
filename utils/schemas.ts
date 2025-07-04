import type { ITag } from '~/types/Tag'
import { z } from 'zod/v4'
import { OCR_LANGUAGES } from '../constants'

export const PASSWORD_REGEX = /^(?=.*[a-zA-Z])(?=.*\d)[a-zA-Z\d_]*$/

export const zPassword = z
  .string()
  .max(16)
  .min(6)
  .regex(
    PASSWORD_REGEX,
    'Password must be at least 6 characters long and contain at least one letter and one number'
  )
export type ZPassword = z.output<typeof zPassword>

type ZTagOmit = Omit<
  Record<keyof ITag, z.ZodType>,
  'id' | 'createdAt' | 'updatedAt' | 'translation'
>
export const zTag = z.object<ZTagOmit>(
  {
    pageID: z.number().nonnegative().optional(),
    tagID: z.string().optional(),
    className: z.string().optional(),
    width: z.number().nonnegative().optional(),
    height: z.number().nonnegative().optional(),
    x: z.number().nonnegative().optional(),
    y: z.number().nonnegative().optional(),
    locked: z.boolean().optional(),
    style: z.any().optional(),
    translationID: z.string().nullable().optional(),
  },
  'Tag parameters validate failed'
)

export type ZTag = z.output<typeof zTag>

export const zID = z.union(
  [z.int().gt(0), z.string().min(1)],
  'ID must be a positive integer or a string'
)
export type ZID = z.output<typeof zID>

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
export type ZOCR = z.output<typeof zOCR>

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
export type ZProjectSetting = z.output<typeof zProjectSetting>
