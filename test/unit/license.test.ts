import { generateKeyPairSync, createPrivateKey, sign } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import {
  licenseState,
  licenseStatusAt,
  verifyLicense,
  type LicensePayload,
} from '#server/helper/license'
import { LICENSE_GRACE_DAYS } from '#shared/constants'

const { publicKey, privateKey } = generateKeyPairSync('ed25519')
const publicKeyPem = publicKey.export({ type: 'spki', format: 'pem' }).toString()
const privateKeyPem = privateKey.export({ type: 'pkcs8', format: 'pem' }).toString()

function makePayload(overrides: Partial<LicensePayload> = {}): LicensePayload {
  return {
    licenseId: 'lic_test',
    customer: 'ACME',
    issuedAt: '2026-10-01T00:00:00.000Z',
    expiresAt: '2027-10-16T00:00:00.000Z',
    features: ['plus'],
    ...overrides,
  }
}

function signKey(
  payload: unknown,
  keyPem: string = privateKeyPem
): string {
  const payloadSegment = Buffer.from(JSON.stringify(payload), 'utf8').toString(
    'base64url'
  )
  const signature = sign(
    null,
    Buffer.from(payloadSegment, 'utf8'),
    createPrivateKey(keyPem)
  )
  return `${payloadSegment}.${signature.toString('base64url')}`
}

describe('verifyLicense', () => {
  it('accepts a well-formed key', () => {
    const payload = makePayload()
    expect(verifyLicense(signKey(payload), publicKeyPem)).toEqual(payload)
  })

  it('rejects a payload tampered by one byte', () => {
    const key = signKey(makePayload())
    const [payloadSegment, signatureSegment] = key.split('.')
    // The signature covers the segment bytes, so any edit breaks it.
    const at = Math.floor(payloadSegment.length / 2)
    const original = payloadSegment[at]!
    const flipped = original === 'A' ? 'B' : 'A'
    const tampered =
      payloadSegment.slice(0, at) + flipped + payloadSegment.slice(at + 1)
    expect(verifyLicense(`${tampered}.${signatureSegment}`, publicKeyPem)).toBe(
      null
    )
  })

  it('rejects a key signed with a different keypair', () => {
    const other = generateKeyPairSync('ed25519')
    const otherPem = other.privateKey
      .export({ type: 'pkcs8', format: 'pem' })
      .toString()
    expect(verifyLicense(signKey(makePayload(), otherPem), publicKeyPem)).toBe(
      null
    )
  })

  it.each([
    ['empty string', ''],
    ['no separator', 'noseparator'],
    ['too few segments', '.'],
    ['too many segments', 'a.b.c'],
    ['non-base64 payload', '###.sig'],
    ['payload not JSON', `${Buffer.from('not json', 'utf8').toString('base64url')}.sig`],
  ])('rejects malformed input: %s', (_label, raw) => {
    expect(verifyLicense(raw, publicKeyPem)).toBe(null)
  })

  it('rejects a payload missing expiresAt', () => {
    const payload = makePayload() as Partial<LicensePayload>
    delete payload.expiresAt
    expect(verifyLicense(signKey(payload), publicKeyPem)).toBe(null)
  })

  it('rejects a payload missing features', () => {
    const payload = makePayload() as Partial<LicensePayload>
    delete payload.features
    expect(verifyLicense(signKey(payload), publicKeyPem)).toBe(null)
  })

  it('caches by (raw, key): same input, same answer without re-verify', () => {
    const key = signKey(makePayload())
    const first = verifyLicense(key, publicKeyPem)
    const second = verifyLicense(key, publicKeyPem)
    expect(second).toBe(first)
  })

  it('rejects when no public key is configured', () => {
    expect(verifyLicense(signKey(makePayload()), '')).toBe(null)
  })
})

describe('licenseStatusAt', () => {
  const expiresAt = new Date('2027-10-16T00:00:00.000Z')
  const dayMs = 24 * 60 * 60 * 1000

  it('is active before expiresAt', () => {
    const now = new Date(expiresAt.getTime() - 1)
    expect(licenseStatusAt(makePayload(), now)).toBe('active')
  })

  it('is grace at the expiresAt instant', () => {
    expect(licenseStatusAt(makePayload(), expiresAt)).toBe('grace')
  })

  it(`is grace at day ${LICENSE_GRACE_DAYS - 1} of the window`, () => {
    const now = new Date(expiresAt.getTime() + (LICENSE_GRACE_DAYS - 1) * dayMs)
    expect(licenseStatusAt(makePayload(), now)).toBe('grace')
  })

  it(`is expired at day ${LICENSE_GRACE_DAYS}`, () => {
    const now = new Date(expiresAt.getTime() + LICENSE_GRACE_DAYS * dayMs)
    expect(licenseStatusAt(makePayload(), now)).toBe('expired')
  })

  it('is expired well past the window', () => {
    const now = new Date(expiresAt.getTime() + (LICENSE_GRACE_DAYS + 1) * dayMs)
    expect(licenseStatusAt(makePayload(), now)).toBe('expired')
  })
})

describe('licenseState', () => {
  const original = process.env.NUXT_LICENSE_KEY

  function withEnv(value: string | undefined, run: () => void) {
    if (value === undefined) delete process.env.NUXT_LICENSE_KEY
    else process.env.NUXT_LICENSE_KEY = value
    try {
      run()
    } finally {
      if (original === undefined) delete process.env.NUXT_LICENSE_KEY
      else process.env.NUXT_LICENSE_KEY = original
    }
  }

  it('is none when the env var is absent', () => {
    withEnv(undefined, () => {
      expect(licenseState()).toEqual({ status: 'none', plus: false })
    })
  })

  it('is none when the env var is blank', () => {
    withEnv('   ', () => {
      expect(licenseState()).toEqual({ status: 'none', plus: false })
    })
  })

  it('is invalid when the env var is garbage', () => {
    withEnv('not-a-license', () => {
      expect(licenseState()).toEqual({ status: 'invalid', plus: false })
    })
  })
})
