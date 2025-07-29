import type { H3Event, EventHandlerRequest } from 'h3'
import AgentManager from '#server/libs/agent'
import type { AgentJWT } from '#shared/types'

export async function requireAgentJWT(event: H3Event<EventHandlerRequest>) {
  const session = await requireUserSession(event)
  let agentJWT = session.agentJWT as AgentJWT
  if (!agentJWT || agentJWT.expires_in < Date.now()) {
    agentJWT = await AgentManager.getJWTToken()
    await replaceUserSession(event, { agentJWT })
  }
  return agentJWT
}
