import bcrypt from 'bcryptjs'
import { z } from 'zod/v4'
import prisma from '#server/libs/prisma'
import { readZodBody } from '#server/helper/validate'
import {
  AtlassianAuthError,
  bindAtlassianToUser,
  loadPublicUser,
  loginOrProvisionAtlassianUser,
} from '#server/helper/atlassian-auth'
import { isLinkExpired, pickLinkTarget } from '#server/helper/atlassian-link'
import {
  allowedEmailDomains,
  backfillUserEmail,
  type PendingAtlassianLink,
} from '#server/helper/atlassian-link-flow'
import {
  assertLinkNotRateLimited,
  clearLinkFailures,
  recordLinkFailure,
} from '#server/helper/atlassian-link-limit'
import { sessionCookieOptions } from '#server/helper/session'
import type { UserRole } from '#shared/constants'

const zLink = z.discriminatedUnion('action', [
  z.object({
    action: z.literal('link'),
    username: z.string().trim().optional(),
    password: z.string().min(1, 'Please enter your password'),
  }),
  z.object({ action: z.literal('create') }),
])

/**
 * @route POST /api/auth/atlassian-link
 * @description Finish a parked Atlassian sign-in: prove the existing account
 * with its password and link to it, or open a separate account instead.
 * @access Public (needs the pending link the Atlassian callback put in the session)
 */
export default defineEventHandler(async (event) => {
  const body = await readZodBody(event, zLink.parse)
  const session = await getUserSession(event)
  const pending = (
    session.secure as { atlassianLink?: PendingAtlassianLink } | undefined
  )?.atlassianLink
  if (!pending || isLinkExpired(pending.expiresAt)) {
    await clearUserSession(event)
    throw createError({
      statusCode: 400,
      statusMessage: 'This request expired. Sign in with Atlassian again.',
    })
  }

  const domains = allowedEmailDomains()
  const accountId = pending.profile.account_id ?? ''

  const signIn = async (user: {
    id: number
    username: string
    role: string
  }) => {
    // `replace`, not `set`: it drops the pending link along with the old session.
    await replaceUserSession(
      event,
      {
        user: {
          id: user.id,
          username: user.username,
          role: user.role as UserRole,
        },
      },
      sessionCookieOptions(event)
    )
    return { user: await loadPublicUser(user.id) }
  }

  try {
    switch (body.action) {
      case 'create': {
        const created = await loginOrProvisionAtlassianUser(
          pending.profile,
          domains
        )
        return await signIn(created)
      }
      case 'link': {
        assertLinkNotRateLimited(event, accountId)
        const candidates = await prisma.user.findMany({
          where: { id: { in: pending.candidateIds } },
          select: { id: true, username: true, role: true, password: true },
        })
        const target = pickLinkTarget(candidates, body.username)
        // One message for a wrong password and an unknown username alike.
        const verified = target
          ? await bcrypt.compare(body.password, target.password)
          : false
        if (!target || !verified) {
          recordLinkFailure(event, accountId)
          throw createError({
            statusCode: 400,
            statusMessage: 'Incorrect username or password. Please try again.',
          })
        }
        clearLinkFailures(event, accountId)
        await bindAtlassianToUser(target.id, pending.profile, domains)
        await backfillUserEmail(target.id, pending.profile.email)
        return await signIn(target)
      }
      default: {
        const _exhaustive: never = body
        return _exhaustive
      }
    }
  } catch (error) {
    if (error instanceof AtlassianAuthError) {
      throw createError({
        statusCode: 409,
        statusMessage: error.message,
      })
    }
    throw error
  }
})
