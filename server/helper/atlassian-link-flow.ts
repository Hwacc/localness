import prisma from '#server/libs/prisma'
import {
  ATLASSIAN_PROVIDER,
  assertProfile,
  parseAllowedEmailDomains,
  type AtlassianProfile,
} from '#server/helper/atlassian-auth'
import { LINK_TTL_MS, matchLinkCandidates } from '#server/helper/atlassian-link'

/** What the session holds between the Atlassian callback and the password prompt. */
export type PendingAtlassianLink = {
  profile: AtlassianProfile
  candidateIds: number[]
  expiresAt: number
}

export function allowedEmailDomains(): string[] {
  const config = useRuntimeConfig()
  return parseAllowedEmailDomains(
    String(config.atlassianAllowedEmailDomains || '')
  )
}

/**
 * Local accounts an unknown Atlassian sign-in could be linked to.
 *
 * Only an Atlassian account we have not seen has candidates. One that is already
 * linked signs in as its linked account, whatever other accounts share its
 * email — without this, a second account with the same email would prompt on
 * every sign-in.
 *
 * `contains` compiles to LIKE, which SQLite matches case-insensitively for
 * ASCII, so it only narrows the rows; the exact case-insensitive comparison is
 * `matchLinkCandidates`. That keeps dialect SQL out of this file.
 */
export async function findLinkCandidateIds(
  profile: AtlassianProfile,
  domains: string[]
): Promise<number[]> {
  const { accountId, email } = assertProfile(profile, domains)
  const linked = await prisma.authIdentity.findUnique({
    where: {
      provider_providerAccountId: {
        provider: ATLASSIAN_PROVIDER,
        providerAccountId: accountId,
      },
    },
    select: { id: true },
  })
  if (linked) return []

  const rows = await prisma.user.findMany({
    where: { email: { contains: email } },
    select: {
      id: true,
      email: true,
      passwordSetAt: true,
      authIdentities: {
        where: { provider: ATLASSIAN_PROVIDER },
        select: { id: true },
      },
    },
  })
  return matchLinkCandidates(
    rows.map((row) => ({
      id: row.id,
      email: row.email,
      passwordSetAt: row.passwordSetAt,
      hasAtlassian: row.authIdentities.length > 0,
    })),
    email
  )
}

export function newPendingLink(
  profile: AtlassianProfile,
  candidateIds: number[]
): PendingAtlassianLink {
  return { profile, candidateIds, expiresAt: Date.now() + LINK_TTL_MS }
}

/**
 * A verified Atlassian address fills an empty one; it never replaces what the
 * user already has.
 */
export async function backfillUserEmail(
  userId: number,
  email: string | undefined
) {
  if (!email) return
  await prisma.user.updateMany({
    where: { id: userId, OR: [{ email: null }, { email: '' }] },
    data: { email },
  })
}
