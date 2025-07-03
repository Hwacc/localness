import type { NuxtError } from '#app'
import type { H3Event, InferEventInput, ValidateFunction } from 'h3'
import type { $ZodIssue } from 'zod/v4/core'

/**
 * only for server to handle goo error
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
  } catch (error: any) {
    const _error = error as NuxtError<string>
    const issuess = JSON.parse(_error.message) as $ZodIssue[]
    const friendlyMessage = issuess
      .map((issues) => `🎯${issues.path}: ${issues.message || issues.code}`)
      .join(', ')
    throw createError({
      statusCode: 400,
      message: friendlyMessage,
    })
  }
}
