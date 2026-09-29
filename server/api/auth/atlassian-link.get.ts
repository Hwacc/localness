import prisma from '#server/libs/prisma'
import { previewAtlassianUsername } from '#server/helper/atlassian-auth'
import { isLinkExpired } from '#server/helper/atlassian-link'
import type { PendingAtlassianLink } from '#server/helper/atlassian-link-flow'

/**
 * @route GET /api/auth/atlassian-link
 * @description What the password prompt needs: the Atlassian email and the
 * usernames it could be linked to. Only exists between the Atlassian callback
 * and the confirmation, and only for the browser that made the callback.
 * @access Public
 */
export default defineEventHandler(async (event) => {
  const session = await getUserSession(event)
  const pending = (
    session.secure as { atlassianLink?: PendingAtlassianLink } | undefined
  )?.atlassianLink
  if (!pending || isLinkExpired(pending.expiresAt)) {
    return { pending: false as const }
  }
  const users = await prisma.user.findMany({
    where: { id: { in: pending.candidateIds } },
    select: { id: true, username: true, nickname: true, createdAt: true },
    orderBy: { id: 'asc' },
  })
  return {
    pending: true as const,
    email: pending.profile.email ?? '',
    // Enough to tell same-email accounts apart; nothing that helps guess a password.
    accounts: users.map((u) => ({
      username: u.username,
      nickname: u.nickname,
      createdAt: u.createdAt,
    })),
    // What "create a new account" would make, so the user can see it first.
    newAccount: {
      username: await previewAtlassianUsername(pending.profile),
      displayName: pending.profile.name || pending.profile.nickname || '',
      email: pending.profile.email ?? '',
    },
  }
})
