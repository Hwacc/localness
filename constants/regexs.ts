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
