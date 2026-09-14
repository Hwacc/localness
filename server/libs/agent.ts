import type { AbstractAgent } from './agent/AbstractAgent'
import type { ZGenI18nKey } from '#shared/utils/schemas'
import { CozeAgent } from './agent/CozeAgent'

class AgentManager {
  private static instance: AgentManager
  private cozeAgent: AbstractAgent | undefined

  private constructor() {}

  // Built on first use, not on import: `CozeAgent` reads its credential file in
  // the constructor, so an eager build would throw at module evaluation and take
  // the whole server down when the secrets are absent.
  private get agent(): AbstractAgent {
    this.cozeAgent ??= new CozeAgent()
    return this.cozeAgent
  }

  public async generateI18nKey<T>(parmas?: ZGenI18nKey): Promise<T> {
    return this.agent.generateI18nKey(parmas)
  }

  public static getInstance(): AgentManager {
    if (!this.instance) {
      this.instance = new AgentManager()
    }
    return this.instance
  }
}

export default AgentManager.getInstance()
