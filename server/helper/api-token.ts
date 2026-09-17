import { createHash, randomBytes } from 'node:crypto'
import prisma from '#server/libs/prisma'
import {
  API_TOKEN_BYTES,
  API_TOKEN_DISPLAY_PREFIX,
  API_TOKEN_PREFIX,
} from '#shared/constants'

/**
 * Public API credentials. The rules live here rather than in the endpoints
 * because `test/stubs/h3.ts` only stands in for `createError`, so anything left
 * in a `.ts` endpoint is untestable.
 *
 * A token names exactly one Project, so handing one to a consumer never widens
 * into "that Team's whole project list", including projects not yet created.
 */

export class ApiTokenError extends Error {
  constructor(
    public statusCode: number,
    message: string
  ) {
    super(message)
    this.name = 'ApiTokenError'
  }
}

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
 * The row found by that unique index *is* the match, so there is nothing left
 * to compare: a byte-wise re-check of the digest would only ever re-confirm it.
 */
export async function authenticateApiToken(plaintext: string | null) {
  if (!plaintext) {
    throw new ApiTokenError(401, 'Missing API token')
  }
  const hash = hashApiToken(plaintext)
  const row = await prisma.apiToken.findUnique({ where: { tokenHash: hash } })
  if (!row) {
    throw new ApiTokenError(401, 'Invalid API token')
  }
  if (!isApiTokenUsable(row)) {
    throw new ApiTokenError(401, 'API token revoked')
  }
  return row
}

/** A mismatch is a 403, not a 404: the credential is valid, just aimed elsewhere. */
export function assertTokenCoversProject(
  token: { projectId: number },
  projectId: number
): void {
  if (Number(token.projectId) !== Number(projectId)) {
    throw new ApiTokenError(403, 'API token does not cover this project')
  }
}

/** Best-effort usage stamp. A successful read must not fail on bookkeeping. */
export async function touchApiToken(id: number): Promise<void> {
  try {
    await prisma.apiToken.update({
      where: { id },
      data: { lastUsedAt: new Date() },
    })
  } catch {
    // ignore
  }
}

export function apiTokenName(raw: unknown): string {
  const name = typeof raw === 'string' ? raw.trim() : ''
  if (!name) {
    throw new ApiTokenError(400, 'Name is required')
  }
  if (name.length > 60) {
    throw new ApiTokenError(400, 'Name is too long')
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
    throw new ApiTokenError(409, 'Revoke the token before deleting it')
  }
}

/** Endpoints call this instead of re-deriving status codes, so those live in one place. */
export function throwPublicError(error: unknown): never {
  if (error instanceof ApiTokenError) {
    throw createError({
      statusCode: error.statusCode,
      statusMessage: error.message,
    })
  }
  throw error
}
