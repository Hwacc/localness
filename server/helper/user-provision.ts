import { z } from 'zod/v4'
import { zPassword } from '#shared/utils/schemas'

/**
 * Rules for a platform Admin opening a plain USER account.
 *
 * Kept free of h3 so the rules are testable on their own: the endpoint loads
 * and writes, this decides. There is deliberately no `role` here — the endpoint
 * always writes USER, so a body cannot ask for more.
 */

export const USERNAME_MIN_LENGTH = 3
export const USERNAME_MAX_LENGTH = 32
export const NICKNAME_MAX_LENGTH = 60
export const EMAIL_MAX_LENGTH = 254

/** Blank optional fields arrive as '' from a form; treat them as absent. */
function optionalText<T extends z.ZodType<string>>(schema: T) {
  return z
    .union([schema, z.literal('')])
    .nullish()
    .transform((value) => (value ? value : null))
}

export const zUserProvision = z.object({
  username: z
    .string()
    .trim()
    .min(
      USERNAME_MIN_LENGTH,
      `Username needs at least ${USERNAME_MIN_LENGTH} characters`
    )
    .max(
      USERNAME_MAX_LENGTH,
      `Username can be at most ${USERNAME_MAX_LENGTH} characters`
    ),
  password: zPassword,
  email: optionalText(
    z
      .string()
      .trim()
      .max(EMAIL_MAX_LENGTH)
      .pipe(z.email('Please enter a valid email'))
  ),
  nickname: optionalText(z.string().trim().max(NICKNAME_MAX_LENGTH)),
})

export type UserProvisionInput = z.infer<typeof zUserProvision>

export const USER_ADMIN_LOG_ACTION_CREATE = 'USER_CREATE'

export const USER_LIST_MAX_PAGE_SIZE = 50
export const USER_LIST_DEFAULT_PAGE_SIZE = 20

/** Anything unreadable falls back to the defaults rather than throwing. */
export function normalizeUserListPaging(query: {
  page?: unknown
  pageSize?: unknown
}) {
  const page = Number.parseInt(String(query.page ?? ''), 10)
  const size = Number.parseInt(String(query.pageSize ?? ''), 10)
  const pageSize =
    Number.isFinite(size) && size > 0
      ? Math.min(size, USER_LIST_MAX_PAGE_SIZE)
      : USER_LIST_DEFAULT_PAGE_SIZE
  return {
    page: Number.isFinite(page) && page > 0 ? page : 1,
    pageSize,
  }
}
