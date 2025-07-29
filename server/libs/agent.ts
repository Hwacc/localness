import type { AbstractAgent, JTWResult } from "./agent/AbstractAgent"
import { CozeAgent } from "./agent/CozeAgent"


class AgentManager {
  private static instance: AgentManager
  private agent!: AbstractAgent

  private constructor() {
    this.agent = new CozeAgent()
  }

  public async getJWTToken(): Promise<JTWResult> {
    return this.agent.getJwt()
  }

  public static getInstance(): AgentManager {
    if (!this.instance) {
      this.instance = new AgentManager()
    }
    return this.instance
  }
}

export default AgentManager.getInstance()
