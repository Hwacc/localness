/**
 * Minimal stand-in for h3's `createError` so pure-logic modules can be unit
 * tested without resolving the full Nitro dependency tree.
 */
export function createError(input: {
  statusCode?: number
  statusMessage?: string
  data?: unknown
}) {
  const error = new Error(input.statusMessage ?? 'Error') as Error & {
    statusCode?: number
    statusMessage?: string
    data?: unknown
  }
  error.statusCode = input.statusCode
  error.statusMessage = input.statusMessage
  if (input.data !== undefined) error.data = input.data
  return error
}
