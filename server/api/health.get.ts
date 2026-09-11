import prisma from '#server/libs/prisma'

/**
 * @route GET /api/health
 * Container probe: unauthenticated on purpose, and cheap. Reports the database
 * separately so a booted-but-broken instance is not reported as healthy.
 */
export default defineEventHandler(async (event) => {
  let db = false
  try {
    await prisma.$queryRawUnsafe('SELECT 1')
    db = true
  } catch {
    db = false
  }
  if (!db) setResponseStatus(event, 503)
  return { ok: db, db, uptime: Math.round(process.uptime()) }
})
