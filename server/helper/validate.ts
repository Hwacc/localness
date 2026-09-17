import type { H3Event, InferEventInput, ValidateFunction } from 'h3'
import type { $ZodIssue } from 'zod/v4/core'

/**
 * The zod issues behind a rejected body, when this error carries any.
 *
 * h3's `validateData` hangs the original validation error off `error.data` and
 * copies its `message` onto the HTTP error. Zod's message happens to be
 * `JSON.stringify(issues)`, which is why reading the message worked — but the
 * request never reaches zod when the body is not JSON at all: `readBody` throws
 * its own 400 with the plain sentence "Invalid JSON body", and `JSON.parse` on
 * that threw a second error, turning a 400 into a 500.
 */
export function zodIssuesOf(error: unknown): $ZodIssue[] | null {
  const issues = (error as { data?: { issues?: unknown } } | null)?.data?.issues
  return Array.isArray(issues) ? (issues as $ZodIssue[]) : null
}

/**
 * only for server to handle zod error
 * @param event
 * @param validate
 * @returns
 */
export async function readZodBody<
  T,
  Event extends H3Event = H3Event,
  _T = InferEventInput<'body', Event, T>
>(event: Event, validate: ValidateFunction<_T>): Promise<_T> {
  try {
    return await readValidatedBody(event, validate)
  } catch (error) {
    const issues = zodIssuesOf(error)
    if (!issues) throw error
    throw createError({
      statusCode: 400,
      message: issues
        .map((issue) => `🎯${issue.path}: ${issue.message || issue.code}`)
        .join(', '),
    })
  }
}
