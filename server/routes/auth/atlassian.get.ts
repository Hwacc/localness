import {
  AtlassianAuthError,
  atlassianOAuthRedirect,
  bindAtlassianToUser,
  loginOrProvisionAtlassianUser,
  parseAllowedEmailDomains,
} from '#server/helper/atlassian-auth'
import { sessionCookieOptions } from '#server/helper/session'
import { numericID } from '#server/helper/id'
import type { UserRole } from '#shared/constants'

export default defineOAuthAtlassianEventHandler({
  config: {
    scope: ['read:me'],
  },
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
        await bindAtlassianToUser(
          numericID(sessionUserId),
          atlassianUser,
          domains
        )
        return sendRedirect(event, '/dashboard?settings=1&oauth=bound')
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
})
