import {
  AtlassianAuthError,
  atlassianOAuthRedirect,
  bindAtlassianToUser,
  loginOrProvisionAtlassianUser,
  parseAllowedEmailDomains,
} from '#server/helper/atlassian-auth'
import {
  backfillUserEmail,
  findLinkCandidateIds,
  newPendingLink,
} from '#server/helper/atlassian-link-flow'
import { sessionCookieOptions } from '#server/helper/session'
import { numericID } from '#server/helper/id'
import type { UserRole } from '#shared/constants'

/**
 * No `config.scope`: scope is whatever the 3LO app is granted in the Atlassian
 * developer console, and a value here cannot narrow it.
 */
const oauthOptions: Parameters<typeof defineOAuthAtlassianEventHandler>[0] = {
  async onSuccess(event, { user: atlassianUser }) {
    const config = useRuntimeConfig()
    const domains = parseAllowedEmailDomains(
      String(config.atlassianAllowedEmailDomains || '')
    )
    const existingSession = await getUserSession(event)
    const sessionUserId = existingSession.user?.id
    const boundFlow = sessionUserId != null

    try {
      if (boundFlow) {
        const userId = numericID(sessionUserId)
        await bindAtlassianToUser(userId, atlassianUser, domains)
        await backfillUserEmail(userId, atlassianUser.email)
        return sendRedirect(event, '/dashboard?settings=1&oauth=bound')
      }

      // An Atlassian account we have not seen, whose email an existing account
      // already carries: do not open a second account and do not sign anyone in
      // on the strength of a typed-in email. Park the sign-in and ask for that
      // account's password.
      const candidateIds = await findLinkCandidateIds(atlassianUser, domains)
      if (candidateIds.length > 0) {
        await clearUserSession(event)
        await setUserSession(
          event,
          { secure: { atlassianLink: newPendingLink(atlassianUser, candidateIds) } },
          sessionCookieOptions(event)
        )
        return sendRedirect(event, '/?link=atlassian')
      }

      const localUser = await loginOrProvisionAtlassianUser(
        atlassianUser,
        domains
      )
      await setUserSession(
        event,
        {
          user: {
            id: localUser.id,
            username: localUser.username,
            role: localUser.role as UserRole,
          },
        },
        sessionCookieOptions(event)
      )
      return sendRedirect(event, '/transfer')
    } catch (error) {
      if (error instanceof AtlassianAuthError) {
        return sendRedirect(
          event,
          atlassianOAuthRedirect(error.code, boundFlow)
        )
      }
      throw error
    }
  },
  async onError(event) {
    const session = await getUserSession(event)
    if (session.user?.id) {
      return sendRedirect(event, '/dashboard?oauth_error=atlassian&settings=1')
    }
    return sendRedirect(event, '/?oauth_error=atlassian')
  },
}

/**
 * The provider handler is built per request on purpose.
 *
 * nuxt-auth-utils 0.5.30 does `config = defu(config, runtimeConfig, defaults)`
 * *inside* the handler and assigns back to the destructured `config` binding,
 * which the closure keeps between requests. `defu` concatenates arrays, so every
 * hit re-merged the defaults into the already-merged value and `scope` grew by
 * two entries each time — `read:me read:account read:me read:account …` without
 * bound. Atlassian tolerates duplicates, but a long-running process eventually
 * builds an authorize URL too long to send.
 *
 * Constructing the handler here gives `config` a fresh binding per request, so
 * the merge always starts from `undefined`. All 48 providers in that version
 * share the pattern, so this is a workaround, not a fix — drop it once upstream
 * stops reassigning `config`.
 */
export default defineEventHandler((event) =>
  defineOAuthAtlassianEventHandler(oauthOptions)(event)
)
