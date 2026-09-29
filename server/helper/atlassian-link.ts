/**
 * Rules for tying an Atlassian sign-in to an account that already exists.
 *
 * Kept free of h3 and Prisma so the decisions are testable on their own: the
 * endpoints load rows and write, this decides.
 *
 * The Atlassian email is trustworthy (nuxt-auth-utils refuses an unverified one
 * before `onSuccess`). The local `User.email` is not — anyone can type any
 * address into their profile — so a matching email only ever *offers* a link;
 * the account's password is what proves the person owns it.
 */

/** How long a pending link waits for the password before it is discarded. */
export const LINK_TTL_MS = 10 * 60 * 1000

export type LinkCandidateRow = {
  id: number
  email: string | null
  passwordSetAt: Date | null
  /** Already tied to an Atlassian account, so it cannot take a second one. */
  hasAtlassian: boolean
}

export function normalizeEmail(email: string | null | undefined): string {
  return (email ?? '').trim().toLowerCase()
}

/**
 * Accounts an Atlassian sign-in may be linked to: same email (case-insensitive),
 * a password to confirm with, and no Atlassian account yet. An account without a
 * password could only be "confirmed" by nothing, so it is never offered.
 */
export function matchLinkCandidates(
  rows: LinkCandidateRow[],
  email: string
): number[] {
  const wanted = normalizeEmail(email)
  if (!wanted) return []
  return rows
    .filter(
      (row) =>
        normalizeEmail(row.email) === wanted &&
        row.passwordSetAt != null &&
        !row.hasAtlassian
    )
    .map((row) => row.id)
}

export function isLinkExpired(expiresAt: number, now: number = Date.now()) {
  return expiresAt <= now
}

/**
 * Which candidate the user is confirming. One candidate needs no username; with
 * several, the username must name one of them — a stranger's account is never
 * reachable by guessing an id.
 */
export function pickLinkTarget<T extends { id: number; username: string }>(
  candidates: T[],
  username?: string
): T | null {
  if (candidates.length === 0) return null
  const wanted = username?.trim()
  if (candidates.length === 1 && !wanted) return candidates[0] ?? null
  if (!wanted) return null
  return candidates.find((c) => c.username === wanted) ?? null
}

export type UnbindRejectReason = 'not-bound' | 'no-password'

export const UNBIND_MESSAGES: Record<UnbindRejectReason, string> = {
  'not-bound': 'This account is not connected to Atlassian',
  'no-password':
    'Set a password first, or you will not be able to sign in after disconnecting',
}

/**
 * Disconnecting keeps the account, so it must stay reachable: an account that
 * signs in only through Atlassian (random password, never set) would be locked
 * out for good the moment its only login is removed.
 */
export function unbindRejectReason(input: {
  connected: boolean
  hasPassword: boolean
}): UnbindRejectReason | null {
  if (!input.connected) return 'not-bound'
  if (!input.hasPassword) return 'no-password'
  return null
}
