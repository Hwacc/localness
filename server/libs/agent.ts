import type { AbstractAgent } from './agent/AbstractAgent'
import type { ZGenI18nKey } from '#shared/utils/schemas'
import { CozeAgent } from './agent/CozeAgent'

class AgentManager {
  private static instance: AgentManager
  private agent!: AbstractAgent

  private constructor() {
    this.agent = new CozeAgent()
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
