import type { H3Event } from 'h3'

const WINDOW_MS = 10 * 60 * 1000
const MAX_FAILURES = 10

const failures = new Map<string, { count: number; resetAt: number }>()

function bucketKey(event: H3Event, userId: number): string {
  const ip = getRequestIP(event, { xForwardedFor: true }) || 'unknown'
  return `${userId}:${ip}`
}

export function assertJoinNotRateLimited(event: H3Event, userId: number) {
  const key = bucketKey(event, userId)
  const now = Date.now()
  const bucket = failures.get(key)
  if (!bucket || bucket.resetAt <= now) return
  if (bucket.count >= MAX_FAILURES) {
    throw createError({
      statusCode: 429,
      statusMessage: 'Too many invalid invite attempts. Try again later.',
    })
  }
}

export function recordJoinFailure(event: H3Event, userId: number) {
  const key = bucketKey(event, userId)
  const now = Date.now()
  const bucket = failures.get(key)
  if (!bucket || bucket.resetAt <= now) {
    failures.set(key, { count: 1, resetAt: now + WINDOW_MS })
    return
  }
  bucket.count += 1
}

export function clearJoinFailures(event: H3Event, userId: number) {
  failures.delete(bucketKey(event, userId))
}

/** Test-only. */
export function resetJoinRateLimit() {
  failures.clear()
}
