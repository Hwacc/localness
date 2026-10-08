import {
  authenticateDeliveryRequest,
  bearerToken,
  touchApiToken,
} from '#server/helper/api-token'
import { resolveTokenProject } from '#server/helper/api-token-project'
import { mcpHandler } from '#server/helper/mcp'

/**
 * MCP endpoint, over the Streamable HTTP transport.
 *
 * It sits beside `/api/v1` rather than under it: this is a second public face on
 * the same credential, not a resource of the REST API, and `/mcp` is what a URL
 * in a client's config reads as.
 *
 * **The project is named in the query string, not by a tool argument.** Nine
 * tools would otherwise each need a `project` parameter, and their schemas are
 * what an agent reads — a parameter on every call is context spent on something
 * that does not change within a session. `?project=` also keeps the choice where
 * the credential's choice already lives, in the client's config, so one MCP
 * server entry means one project.
 *
 * It is optional when the token was granted exactly one project, which is every
 * token minted before tokens became personal, so existing configs keep working.
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

  // Resolved *before* the MCP handler exists, so a bad or missing project is an
  // ordinary HTTP error with a real status. Inside a tool callback the SDK turns
  // a thrown error into `{isError:true}` at HTTP 200, which is the right shape
  // for "this key does not exist" and the wrong one for "you did not say which
  // project".
  const projectId = await resolveTokenProject(token, getQuery(event).project)
  await touchApiToken(token)

  const response = await mcpHandler.fetch(toWebRequest(event), {
    authInfo: {
      token: bearerToken(header) ?? '',
      // The credential's own identity, which is what a client id means here.
      clientId: token.prefix,
      scopes: [],
      // `AuthInfo` has no project field and does not want one — a project is not
      // an OAuth notion, and `extra` is documented as the place for exactly that
      // kind of fact. Resolved once, here, so the tools cannot re-derive
      // something different.
      extra: { projectId },
    },
  })

  return sendWebResponse(event, response)
})
