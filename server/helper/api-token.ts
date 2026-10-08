import { createHash, randomBytes } from 'node:crypto'
import { createError } from 'h3'
import prisma from '#server/libs/prisma'
import {
  API_TOKEN_BYTES,
  API_TOKEN_DISPLAY_PREFIX,
  API_TOKEN_PREFIX,
  API_TOKEN_TOUCH_INTERVAL_MS,
  ApiTokenScope,
} from '#shared/constants'

/**
 * Public API credentials. The rules live here rather than in the endpoints
 * because `test/stubs/h3.ts` only stands in for `createError`, so anything left
 * in a `.ts` endpoint is untestable. That is also why `createError` is imported
 * here instead of left to Nitro's auto-import: the alias that makes these tests
 * possible resolves the `h3` module, and an unimported global would not.
 *
 * A token belongs to a person and names the Projects it may reach. Which project
 * a request is about, and whether this credential is still allowed there, is
 * `api-token-project.ts` — deliberately a separate module, because that is the
 * half that has to consult live membership rather than the row.
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
 * The v1 credential path in one call: bearer header to the token row.
 *
 * This only establishes *who* is calling. Which project they may address is a
 * second question, and it is answered per request by `api-token-project.ts`
 * rather than baked into the row — that is what makes the credential die with
 * its owner's membership.
 */
export async function authenticateDeliveryRequest(header: unknown) {
  return authenticateApiToken(bearerToken(header))
}

/**
 * An absent scope is read, never write. A row that somehow predates the column —
 * or one written by a path that forgot to set it — must fail closed rather than
 * become a credential that can rewrite the dictionary.
 */
export function tokenAllowsScope(
  row: { scope?: string | null },
  required: ApiTokenScope
): boolean {
  const scope = row.scope ?? ApiTokenScope.READ
  if (required === ApiTokenScope.READ) {
    return scope === ApiTokenScope.READ || scope === ApiTokenScope.WRITE
  }
  return scope === ApiTokenScope.WRITE
}

export function assertTokenScope(
  row: { scope?: string | null },
  required: ApiTokenScope
): void {
  if (!tokenAllowsScope(row, required)) {
    throw createError({
      statusCode: 403,
      statusMessage: 'This API token is read-only',
    })
  }
}

/**
 * The verb that pairs with `authenticateDeliveryRequest`: same 401s, plus the
 * scope decision. Nothing in CORS enforces this — CORS only decides which
 * requests a browser may send, and a non-browser caller ignores it entirely.
 */
export async function authenticateWriteRequest(header: unknown) {
  const row = await authenticateDeliveryRequest(header)
  assertTokenScope(row, ApiTokenScope.WRITE)
  return row
}

/** Defaults to read: a caller has to ask for a credential that can write. */
export function apiTokenScope(raw: unknown): ApiTokenScope {
  if (raw === undefined || raw === null || raw === '') return ApiTokenScope.READ
  if (raw === ApiTokenScope.READ || raw === ApiTokenScope.WRITE) return raw
  throw createError({ statusCode: 400, statusMessage: 'Invalid API token scope' })
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
 * Who may stop a whole credential: the person it belongs to, or a platform
 * Admin.
 *
 * A project steward deliberately has no vote here. They used to, back when a
 * token reached exactly one project and "that project's steward" was a single
 * answer. A personal token spans projects, so letting the steward of one of them
 * revoke it would let them cut off access to the others — authority they do not
 * have. Their lever is `canDetachProjectFromToken` below, which reaches exactly
 * as far as their own project.
 */
export function canRevokeApiToken(
  row: { createdBy: number },
  actor: { userId: number; isAdmin: boolean }
): boolean {
  return actor.isAdmin || Number(row.createdBy) === Number(actor.userId)
}

export function assertApiTokenRevocable(
  row: { createdBy: number },
  actor: { userId: number; isAdmin: boolean }
): void {
  if (!canRevokeApiToken(row, actor)) {
    throw createError({
      statusCode: 403,
      statusMessage: 'Only the token owner or a platform admin can revoke it',
    })
  }
}

/**
 * Who may take *one project* out of a token's set: a steward of that project, or
 * the token's owner.
 *
 * This exists so a steward is not left powerless against a leaked credential
 * they cannot get the owner to revoke — otherwise their only lever would be
 * removing the person from the team, a far bigger act. It is scoped to their own
 * project on purpose: it must not touch the token's reach anywhere else.
 */
export function canDetachProjectFromToken(
  row: { createdBy: number },
  actor: { userId: number; isSteward: boolean }
): boolean {
  return actor.isSteward || Number(row.createdBy) === Number(actor.userId)
}

export function assertProjectDetachable(
  row: { createdBy: number },
  actor: { userId: number; isSteward: boolean }
): void {
  if (!canDetachProjectFromToken(row, actor)) {
    throw createError({
      statusCode: 403,
      statusMessage:
        'Only the token owner or a steward of this project can cut off its access',
    })
  }
}
