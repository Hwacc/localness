import { createPublicKey, verify } from 'node:crypto'
import { createError } from 'h3'
import { LICENSE_GRACE_DAYS } from '#shared/constants'

/**
 * Offline Plus license. `NUXT_LICENSE_KEY` is `base64url(payload) + "." +
 * base64url(ed25519 signature)`, where the signature covers the payload
 * segment's transmitted bytes — not a re-serialization, so JSON key order can
 * never break verification.
 *
 * All logic lives here rather than in endpoints because `test/stubs/h3.ts`
 * only stands in for `createError`; that is also why `createError` is imported
 * rather than left to Nitro's auto-import.
 *
 * The public key is hardcoded on purpose: an overridable key is a key anyone
 * can replace with their own and self-sign. The matching private key lives in
 * the issuer's password manager (`pnpm license:keygen`, 2026-10-16); losing it
 * means no license can ever be signed again.
 */
const LICENSE_PUBLIC_KEY = `-----BEGIN PUBLIC KEY-----
MCowBQYDK2VwAyEAu5gkcJmEZ6WF86fKKM3YxfLRdmkn1HtOE9SHcoF9b98=
-----END PUBLIC KEY-----`

export interface LicensePayload {
  licenseId: string
  customer: string
  issuedAt: string
  expiresAt: string
  features: string[]
  seats?: number
}

export type LicenseStatus =
  | 'none'
  | 'invalid'
  | 'active'
  | 'grace'
  | 'expired'

export interface LicenseState {
  status: LicenseStatus
  plus: boolean
  customer?: string
  licenseId?: string
  expiresAt?: string
}

/**
 * Signature + format. Expensive and static, so the last answer is memoized on
 * (raw, key). Env vars change only on restart, and tests inject their own
 * keypairs, so a single-entry cache cannot serve a stale hit.
 */
let verifyCache: {
  raw: string
  publicKeyPem: string
  payload: LicensePayload | null
} | null = null

export function verifyLicense(
  raw: string,
  publicKeyPem: string = LICENSE_PUBLIC_KEY
): LicensePayload | null {
  if (verifyCache && verifyCache.raw === raw && verifyCache.publicKeyPem === publicKeyPem) {
    return verifyCache.payload
  }
  const payload = computeVerifiedLicense(raw, publicKeyPem)
  verifyCache = { raw, publicKeyPem, payload }
  return payload
}

function computeVerifiedLicense(
  raw: string,
  publicKeyPem: string
): LicensePayload | null {
  try {
    if (!raw || !publicKeyPem) return null
    const segments = raw.split('.')
    if (segments.length !== 2) return null
    const [payloadSegment, signatureSegment] = segments
    if (!payloadSegment || !signatureSegment) return null

    const payloadBytes = Buffer.from(payloadSegment, 'utf8')
    const signature = Buffer.from(signatureSegment, 'base64url')
    const publicKey = createPublicKey(publicKeyPem)
    if (!verify(null, payloadBytes, publicKey, signature)) return null

    const parsed: unknown = JSON.parse(
      Buffer.from(payloadSegment, 'base64url').toString('utf8')
    )
    return isLicensePayload(parsed) ? parsed : null
  } catch {
    return null
  }
}

function isLicensePayload(value: unknown): value is LicensePayload {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return false
  }
  const v = value as Record<string, unknown>
  if (typeof v.licenseId !== 'string' || !v.licenseId) return false
  if (typeof v.customer !== 'string' || !v.customer) return false
  if (!isDateString(v.issuedAt) || !isDateString(v.expiresAt)) return false
  if (
    !Array.isArray(v.features) ||
    !v.features.every((feature) => typeof feature === 'string')
  ) {
    return false
  }
  if (v.seats !== undefined && typeof v.seats !== 'number') return false
  return true
}

function isDateString(value: unknown): value is string {
  return (
    typeof value === 'string' &&
    value !== '' &&
    !Number.isNaN(new Date(value).getTime())
  )
}

/**
 * Time judgment only: cheap, recomputed on every call. Folding this into
 * `verifyLicense` would freeze a long-running container's status at whatever it
 * was at boot — the one reason the two layers are kept apart.
 */
export function licenseStatusAt(
  payload: LicensePayload,
  now: Date
): Exclude<LicenseStatus, 'none' | 'invalid'> {
  const expiresAt = new Date(payload.expiresAt).getTime()
  if (now.getTime() < expiresAt) return 'active'
  const graceEndsAt =
    expiresAt + LICENSE_GRACE_DAYS * 24 * 60 * 60 * 1000
  return now.getTime() < graceEndsAt ? 'grace' : 'expired'
}

export function licenseState(now: Date = new Date()): LicenseState {
  const raw = process.env.NUXT_LICENSE_KEY?.trim()
  if (!raw) return { status: 'none', plus: false }

  const payload = verifyLicense(raw)
  if (!payload) return { status: 'invalid', plus: false }

  const status = licenseStatusAt(payload, now)
  const plus =
    (status === 'active' || status === 'grace') &&
    payload.features.includes('plus')

  return {
    status,
    plus,
    customer: payload.customer,
    licenseId: payload.licenseId,
    expiresAt: payload.expiresAt,
  }
}

export function requirePlus(): void {
  if (!licenseState().plus) {
    throw createError({
      statusCode: 403,
      statusMessage: 'Plus license required',
    })
  }
}
