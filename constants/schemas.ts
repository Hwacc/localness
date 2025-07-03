import type { ITag } from '~/types/interfaces'
import { z } from 'zod/v4'
import { OCR_LANGUAGES } from '.'

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

type ZTagOmit = Omit<
  Record<keyof ITag, z.ZodType>,
  'id' | 'createdAt' | 'updatedAt' | 'translation'
>
export const zTag = z.object<ZTagOmit>({
  pageID: z.number().nonnegative().optional(),
  tagID: z.string().optional(),
  className: z.string().optional(),
  width: z.number().nonnegative().optional(),
  height: z.number().nonnegative().optional(),
  x: z.number().nonnegative().optional(),
  y: z.number().nonnegative().optional(),
  locked: z.boolean().optional(),
  style: z.any().optional(),
  text: z.string().nullable().optional(),
  i18nKey: z.string().nullable().optional(),
  translationID: z.string().nullable().optional(),
})
export type ZTag = z.infer<typeof zTag>

export const zID = z.union([z.int().gt(0), z.string().min(1)])
export type ZID = z.infer<typeof zID>

export const zOCR = z.object({
  image: z.string().nonempty(),
  language: z
    .string()
    .optional()
    .refine((v) => OCR_LANGUAGES.some((l) => l.value === v), {
      message: 'language must be en or cn or auto',
    }),
})
export type ZOCR = z.infer<typeof zOCR>
