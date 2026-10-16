/**
 * Signs a Plus license key. Stdout only.
 *
 *   LICENSE_SIGNING_KEY=<pkcs8 pem> pnpm license:sign -- \
 *     --customer "ACME" --expires 2027-10-16 [--license-id <uuid>]
 *
 * `LICENSE_SIGNING_KEY` is the PKCS8 PEM private key. It deliberately has no
 * `NUXT_` prefix: this is issuer-side tooling config, not app config, and it
 * must never reach an instance. `features` is fixed to `["plus"]` — v1 has one
 * tier, and the field is a format extension slot, not a knob.
 */
import { randomUUID, createPrivateKey, sign } from 'node:crypto'

function arg(name: string): string | undefined {
  const index = process.argv.indexOf(`--${name}`)
  return index >= 0 ? process.argv[index + 1] : undefined
}

const customer = arg('customer')
const expires = arg('expires')
if (!customer || !expires) {
  console.error('usage: pnpm license:sign -- --customer "ACME" --expires 2027-10-16 [--license-id <uuid>]')
  process.exit(1)
}
if (Number.isNaN(new Date(expires).getTime())) {
  console.error(`--expires is not a valid date: ${expires}`)
  process.exit(1)
}

const keyPem = process.env.LICENSE_SIGNING_KEY
if (!keyPem) {
  console.error('LICENSE_SIGNING_KEY is not set (PKCS8 PEM private key)')
  process.exit(1)
}

const payload = {
  licenseId: arg('license-id') ?? randomUUID(),
  customer,
  issuedAt: new Date().toISOString(),
  expiresAt: new Date(expires).toISOString(),
  features: ['plus'],
}

// Sign the transmitted segment bytes, not a re-serialization: the verifier
// checks exactly what is on the wire, so JSON key order can never disagree.
const payloadSegment = Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url')
const signature = sign(
  null,
  Buffer.from(payloadSegment, 'utf8'),
  createPrivateKey(keyPem)
)

console.log(`${payloadSegment}.${signature.toString('base64url')}`)
