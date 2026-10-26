import { z } from 'zod/v4'

/** Accepts T | null | undefined, including a missing object key (Zod v4). */
export function zNilable<T extends z.ZodType>(schema: T) {
  return schema.nullish()
}

export const zID = z.union(
  [z.int().gt(0), z.string().min(1)],
  'ID must be a positive integer or a string'
)
export type ZID = z.infer<typeof zID>

/**
 * Profile fields that may be left empty. A form hands back '' once a field has
 * been typed in and cleared, which is "nothing", not a value to validate: it
 * becomes null (clear it) rather than failing the length or format check.
 * `undefined` stays undefined so an omitted field leaves the stored value alone.
 */
export const zOptionalNickname = z
  .union([z.literal(''), z.string().trim().min(3, 'Nickname needs at least 3 characters')])
  .nullish()
  .transform((value) => (value === '' ? null : value))

export const zOptionalEmail = z
  .union([z.literal(''), z.email('Please enter a valid email')])
  .nullish()
  .transform((value) => (value === '' ? null : value))

export const PASSWORD_REGEX = /^(?=.*[a-zA-Z])(?=.*\d)[a-zA-Z\d_]*$/
// Messages are user-facing: forms surface the first failing check, so the empty
// case gets its own prompt instead of falling through to the length message.
export const zPassword = z
  .string()
  .min(1, 'Please enter your password')
  .min(6, 'Password needs at least 6 characters')
  .max(16, 'Password can be at most 16 characters')
  .regex(
    PASSWORD_REGEX,
    'Password can use letters, numbers and underscore, and needs at least one letter and one number'
  )
export type ZPassword = z.infer<typeof zPassword>
