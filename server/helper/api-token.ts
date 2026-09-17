import { createHash, randomBytes } from 'node:crypto'
import { createError } from 'h3'
import prisma from '#server/libs/prisma'
import {
  API_TOKEN_BYTES,
  API_TOKEN_DISPLAY_PREFIX,
  API_TOKEN_PREFIX,
  API_TOKEN_TOUCH_INTERVAL_MS,
} from '#shared/constants'

/**
 * Public API credentials. The rules live here rather than in the endpoints
 * because `test/stubs/h3.ts` only stands in for `createError`, so anything left
 * in a `.ts` endpoint is untestable. That is also why `createError` is imported
 * here instead of left to Nitro's auto-import: the alias that makes these tests
 * possible resolves the `h3` module, and an unimported global would not.
 *
 * A token names exactly one Project, so handing one to a consumer never widens
 * into "that Team's whole project list", including projects not yet created.
 */

/**
 * sha256, not a password hash: the input is 32 bytes of CSPRNG output, so the
 * slow-hash argument does not apply, and the determinism is what allows the
 * indexed lookup by hash instead of scanning every row.
 */
export function hashApiToken(plaintext: string): string {
  return createHash('sha256').update(plaintext, 'utf8').digest('hex')
}

export function apiTokenPrefix(plaintext: string): string {
  return plaintext.slice(0, API_TOKEN_DISPLAY_PREFIX)
}

export function generateApiToken(): string {
  return API_TOKEN_PREFIX + randomBytes(API_TOKEN_BYTES).toString('hex')
}

export function bearerToken(header: unknown): string | null {
  if (typeof header !== 'string') return null
  const match = /^Bearer\s+(\S+)$/i.exec(header.trim())
  return match?.[1] ?? null
}

/** Revoked is gone. Revocation is the only way a token stops working. */
export function isApiTokenUsable(row: { revokedAt?: Date | null }): boolean {
  return !row.revokedAt
}

/**
 * One indexed lookup by hash, so a wrong token costs the same as a near miss.
 * The row that unique index returns *is* the match, so there is nothing left to
 * compare: a byte-wise re-check of the digest could only re-confirm it.
 */
export async function authenticateApiToken(plaintext: string | null) {
  if (!plaintext) {
    throw createError({ statusCode: 401, statusMessage: 'Missing API token' })
  }
  const hash = hashApiToken(plaintext)
  const row = await prisma.apiToken.findUnique({ where: { tokenHash: hash } })
  if (!row) {
    throw createError({ statusCode: 401, statusMessage: 'Invalid API token' })
  }
  if (!isApiTokenUsable(row)) {
    throw createError({ statusCode: 401, statusMessage: 'API token revoked' })
  }
  return row
}

/**
 * The v1 credential path in one call: bearer header to the token row. That row
 * carries `projectId`, and it is where every delivery endpoint gets its project
 * from — the URL names no project, so there is no second answer that could
 * disagree with the credential.
 */
export async function authenticateDeliveryRequest(header: unknown) {
  return authenticateApiToken(bearerToken(header))
}

/**
 * Best-effort usage stamp, refreshed at most once per interval. A failed write
 * must not fail the read it was bookkeeping for.
 */
export async function touchApiToken(row: {
  id: number
  lastUsedAt: Date | null
}): Promise<void> {
  const last = row.lastUsedAt?.getTime() ?? 0
  if (Date.now() - last < API_TOKEN_TOUCH_INTERVAL_MS) return
  try {
    await prisma.apiToken.update({
      where: { id: row.id },
      data: { lastUsedAt: new Date() },
    })
  } catch {
    // ignore
  }
}

export function apiTokenName(raw: unknown): string {
  const name = typeof raw === 'string' ? raw.trim() : ''
  if (!name) {
    throw createError({ statusCode: 400, statusMessage: 'Name is required' })
  }
  if (name.length > 60) {
    throw createError({ statusCode: 400, statusMessage: 'Name is too long' })
  }
  return name
}

/**
 * Only a revoked row may be deleted. Deleting a live one would skip the revoke
 * step entirely: the consumer stops working with nothing recorded about why,
 * while revoking first leaves the audit trail that makes the deletion safe.
 */
export function assertApiTokenPurgeable(row: { revokedAt?: Date | null }): void {
  if (!row.revokedAt) {
    throw createError({
      statusCode: 409,
      statusMessage: 'Revoke the token before deleting it',
    })
  }
}

/**
 * Who may stop a credential. A member may revoke what they minted; a steward may
 * revoke anyone's. Erasing the row outright is a steward action and stays gated
 * in the route, because that destroys the record rather than stopping the token.
 */
export function canRevokeApiToken(
  row: { createdBy: number },
  actor: { userId: number; isSteward: boolean }
): boolean {
  return actor.isSteward || Number(row.createdBy) === Number(actor.userId)
}

export function assertApiTokenRevocable(
  row: { createdBy: number },
  actor: { userId: number; isSteward: boolean }
): void {
  if (!canRevokeApiToken(row, actor)) {
    throw createError({
      statusCode: 403,
      statusMessage: 'Only the token creator or a project steward can revoke it',
    })
  }
}
