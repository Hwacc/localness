import {
  authenticateDeliveryRequest,
  bearerToken,
  touchApiToken,
} from '#server/helper/api-token'
import { mcpHandler } from '#server/helper/mcp'

/**
 * MCP endpoint, over the Streamable HTTP transport.
 *
 * It sits beside `/api/v1` rather than under it: this is a second public face on
 * the same credential, not a resource of the REST API, and `/mcp` is what a URL
 * in a client's config reads as.
 *
 * Auth is the delivery token — the same one `/api/v1` takes, resolved by the
 * same helper. The SDK ships `requireBearerAuth` and using it here would be a
 * mistake: it is for OAuth resource servers, so it answers with a
 * `WWW-Authenticate` challenge pointing at `/.well-known/oauth-protected-resource`
 * and sends clients off to discover an authorization server we do not run. We
 * issue static tokens, so the 401 stays plain and no challenge is advertised.
 *
 * Host and Origin are not validated, which the SDK suggests doing. Every request
 * must present the bearer token and a page in a browser cannot obtain it, so the
 * rebinding and CSRF shapes that validation guards against are already closed.
 * Worth revisiting only if something browser-facing ever talks to this route.
 */
export default defineEventHandler(async (event) => {
  const header = getRequestHeader(event, 'authorization')
  const token = await authenticateDeliveryRequest(header)
  await touchApiToken(token)

  const response = await mcpHandler.fetch(toWebRequest(event), {
    authInfo: {
      token: bearerToken(header) ?? '',
      // The credential's own identity, which is what a client id means here.
      clientId: token.prefix,
      scopes: [],
      // `AuthInfo` has no project field and does not want one — this token's
      // principal is a project, which is not an OAuth notion, and `extra` is
      // documented as the place for exactly that kind of fact. Resolved once,
      // here, so the tools cannot re-derive something different.
      extra: { projectId: token.projectId },
    },
  })

  return sendWebResponse(event, response)
})
