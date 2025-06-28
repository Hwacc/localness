import type { ITag } from '~/types/interfaces'
import { z } from 'zod/v4'

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
