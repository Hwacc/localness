import type { H3Event } from 'h3'

const WINDOW_MS = 10 * 60 * 1000
const MAX_FAILURES = 5

const failures = new Map<string, { count: number; resetAt: number }>()

/** The password prompt is a guessing surface, so it is capped per Atlassian account and IP. */
function bucketKey(event: H3Event, accountId: string): string {
  const ip = getRequestIP(event, { xForwardedFor: true }) || 'unknown'
  return `${accountId}:${ip}`
}

export function assertLinkNotRateLimited(event: H3Event, accountId: string) {
  const bucket = failures.get(bucketKey(event, accountId))
  if (!bucket || bucket.resetAt <= Date.now()) return
  if (bucket.count >= MAX_FAILURES) {
    throw createError({
      statusCode: 429,
      statusMessage: 'Too many incorrect passwords. Try again later.',
    })
  }
}

export function recordLinkFailure(event: H3Event, accountId: string) {
  const key = bucketKey(event, accountId)
  const now = Date.now()
  const bucket = failures.get(key)
  if (!bucket || bucket.resetAt <= now) {
    failures.set(key, { count: 1, resetAt: now + WINDOW_MS })
    return
  }
  bucket.count += 1
}

export function clearLinkFailures(event: H3Event, accountId: string) {
  failures.delete(bucketKey(event, accountId))
}
