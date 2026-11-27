import type { AgentI18nKeyResult } from '#shared/types'
import type { I18nKeyGenerateParams } from './agent/I18nKeyGenerateAgent'
import { I18nKeyGenerateAgent } from './agent/I18nKeyGenerateAgent'
import type {
  TranslationParams,
  TranslationResult,
} from './agent/TranslationAgent'
import { TranslationAgent } from './agent/TranslationAgent'

/**
 * One agent per feature, built on first use: an unconfigured deployment must
 * still boot, and the failure belongs to the request that needed the agent.
 */
class AgentManager {
  private static instance: AgentManager
  private i18nKeyAgent: I18nKeyGenerateAgent | undefined
  private translationAgent: TranslationAgent | undefined

  private constructor() {}

  private get keyGen(): I18nKeyGenerateAgent {
    return (this.i18nKeyAgent ??= new I18nKeyGenerateAgent())
  }

  private get translator(): TranslationAgent {
    return (this.translationAgent ??= new TranslationAgent())
  }

  public translate(params: TranslationParams): Promise<TranslationResult[]> {
    return this.translator.translate(params)
  }

  public translateStream(
    params: TranslationParams
  ): AsyncGenerator<string, void> {
    return this.translator.translateStream(params)
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
