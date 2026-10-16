/**
 * Generates the Ed25519 keypair for license signing. Stdout only — never
 * writes files: the private key belongs in a password manager, and losing it
 * means no license can ever be signed again.
 *
 *   pnpm license:keygen
 *
 * The public key goes into `LICENSE_PUBLIC_KEY` in
 * `server/helper/license.ts` (one-way: it is hardcoded, deliberately not
 * overridable by env). The private key is used by `pnpm license:sign` via the
 * `LICENSE_SIGNING_KEY` env var.
 */
import { generateKeyPairSync } from 'node:crypto'

const { publicKey, privateKey } = generateKeyPairSync('ed25519')

console.log('# PUBLIC KEY — paste into server/helper/license.ts (LICENSE_PUBLIC_KEY)')
console.log(publicKey.export({ type: 'spki', format: 'pem' }).toString())
console.log('# PRIVATE KEY — store in your password manager. Never commit it.')
console.log(privateKey.export({ type: 'pkcs8', format: 'pem' }).toString())
