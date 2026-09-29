import prisma from '#server/libs/prisma'
import { numericID } from '#server/helper/id'
import { ATLASSIAN_PROVIDER } from '#server/helper/atlassian-auth'
import {
  UNBIND_MESSAGES,
  unbindRejectReason,
} from '#server/helper/atlassian-link'

/**
 * @route DELETE /api/auth/atlassian
 * @description Disconnect the signed-in user's Atlassian account. The account and
 * its username stay; it is refused while the account has no password, since that
 * would leave it with no way to sign in.
 * @access Private
 */
export default defineEventHandler(async (event) => {
  const session = await requireUserSession(event)
  const userId = numericID(session.user.id)

  const [user, identity] = await Promise.all([
    prisma.user.findUnique({
      where: { id: userId },
      select: { passwordSetAt: true },
    }),
    prisma.authIdentity.findUnique({
      where: { userId_provider: { userId, provider: ATLASSIAN_PROVIDER } },
      select: { id: true },
    }),
  ])
  const reason = unbindRejectReason({
    connected: Boolean(identity),
    hasPassword: user?.passwordSetAt != null,
  })
  if (reason) {
    throw createError({
      statusCode: 400,
      statusMessage: UNBIND_MESSAGES[reason],
    })
  }
  await prisma.authIdentity.delete({ where: { id: identity!.id } })
  return { ok: true }
})
