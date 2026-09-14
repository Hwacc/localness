import type { H3Event } from 'h3'

const SESSION_MAX_AGE = 60 * 60 * 24 * 30

export function sessionCookieOptions(event: H3Event) {
  const isHttps = event.context.isHttps
  return {
    cookie: {
      httpOnly: isHttps,
      secure: isHttps,
      sameSite: (isHttps ? 'strict' : 'lax') as 'strict' | 'lax',
      maxAge: SESSION_MAX_AGE,
    },
    maxAge: SESSION_MAX_AGE,
  }
}
