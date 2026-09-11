import type { JWTResult } from './AbstractAgent'
import { AbstractAgent, AgentError } from './AbstractAgent'
import type {
  JWTToken,
  WorkflowEventError,
  WorkflowEventMessage,
} from '@coze/api'
import { CozeAPI, getJWTToken, WorkflowEventType } from '@coze/api'
import { URL } from 'node:url'
import type { ZGenI18nKey } from '#shared/utils/schemas'
import { snakeCase, transform } from 'lodash-es'
import type { CozeAgentI18nKeyResult } from '#shared/types'

type CozeSecret = {
  client_type: string
  client_id: string
  coze_www_base: string
  coze_api_base: string
  private_key: string
  public_key_id: string
}

/**
 * Coze reports billing/credit refusals only as free text on the workflow ERROR
 * event, so the kind has to be sniffed from the message.
 */
const QUOTA_MESSAGE = /insufficient|credit|balance|quota|rate limit/i

function toAgentError(error: unknown, fallback: string): AgentError {
  if (error instanceof AgentError) return error
  const message = error instanceof Error ? error.message : String(error)
  return new AgentError('upstream', message || fallback, { cause: error })
}

export class CozeAgent extends AbstractAgent {
  private sceret!: CozeSecret
  private jwt!: JWTToken
  private apiClient: CozeAPI | undefined

  constructor() {
    super()
    this.sceret =
      this.secretAssistant.getSecret<CozeSecret>('coze_oauth_config')
    // No eager initClient() here: it is async, so a failure in the constructor
    // would be an unhandled rejection at import time. generateI18nKey awaits it.
  }

  private async initClient() {
    if (!this.isExpired() && this.apiClient) return
    await this.getJwt()
    this.apiClient = new CozeAPI({
      baseURL: this.sceret.coze_api_base,
      token: this.jwt.access_token,
    })
  }

  public isExpired(): boolean {
    return !this.jwt || this.jwt.expires_in * 1000 < Date.now()
  }

  public async getJwt(): Promise<JWTResult> {
    try {
      if (!this.isExpired()) {
        return {
          token_type: 'Bearer',
          access_token: this.jwt.access_token,
          expires_in: this.jwt.expires_in,
          refresh_token: '',
        }
      }
      this.jwt = await getJWTToken({
        baseURL: this.sceret.coze_api_base,
        appId: this.sceret.client_id,
        aud: new URL(this.sceret.coze_api_base).host,
        keyid: this.sceret.public_key_id,
        privateKey: this.sceret.private_key,
      })
      return {
        token_type: 'Bearer',
        access_token: this.jwt.access_token,
        expires_in: this.jwt.expires_in,
        refresh_token: '',
      }
    } catch (error) {
      console.error('Failed to get JWT OAuth token:', error)
      throw new AgentError(
        'config',
        'Could not authenticate with the AI service',
        { cause: error }
      )
    }
  }

  public async generateI18nKey<T extends CozeAgentI18nKeyResult>(
    parmas?: ZGenI18nKey
  ): Promise<T | null> {
    try {
      if (!parmas) throw new AgentError('bad-params', 'Missing parameters')
      await this.initClient()
      const parameters = transform(
        parmas,
        (result, val, key) => {
          if (key === 'tagI18nKey') {
            result['tag_i18n_key'] = val
            return
          }
          result[snakeCase(key)] = val
        },
        {} as Record<string, any>
      )
      console.log('parmas', parameters)
      const response = this.apiClient?.workflows.runs.stream({
        workflow_id: '7514668272895213594',
        parameters,
      })
      if (!response)
        throw new AgentError('config', 'AI service client is not initialized')
      let result: T | null = null
      for await (const evt of response) {
        if (evt.event === WorkflowEventType.ERROR) {
          const data = evt.data as WorkflowEventError
          const message = data.error_message || 'AI workflow run failed'
          throw new AgentError(
            QUOTA_MESSAGE.test(message) ? 'quota' : 'upstream',
            message
          )
        }
        if (evt.event === WorkflowEventType.MESSAGE) {
          const message = evt.data as WorkflowEventMessage
          if (message.node_is_finish && message.content) {
            try {
              result = JSON.parse(message.content)
            } catch (error) {
              console.error('Failed to parse message content:', error)
            }
          }
        }
        if (evt.event === WorkflowEventType.DONE) break
      }
      return result
    } catch (error) {
      console.error('Failed to generate i18n key:', error)
      throw toAgentError(error, 'AI workflow run failed')
    }
  }
}
