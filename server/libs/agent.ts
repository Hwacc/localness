import type { AgentI18nKeyResult } from '#shared/types'
import type { I18nKeyGenerateParams } from './agent/I18nKeyGenerateAgent'
import { I18nKeyGenerateAgent } from './agent/I18nKeyGenerateAgent'

/**
 * One agent per feature, built on first use: an unconfigured deployment must
 * still boot, and the failure belongs to the request that needed the agent.
 */
class AgentManager {
  private static instance: AgentManager
  private i18nKeyAgent: I18nKeyGenerateAgent | undefined

  private constructor() {}

  private get keyGen(): I18nKeyGenerateAgent {
    return (this.i18nKeyAgent ??= new I18nKeyGenerateAgent())
  }

  public generateI18nKey(
    params: I18nKeyGenerateParams
  ): Promise<AgentI18nKeyResult> {
    return this.keyGen.generateI18nKey(params)
  }

  public static getInstance(): AgentManager {
    if (!this.instance) {
      this.instance = new AgentManager()
    }
    return this.instance
  }
}

export default AgentManager.getInstance()
