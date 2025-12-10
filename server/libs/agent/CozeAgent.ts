import type { JWTResult } from './AbstractAgent'
import { AbstractAgent } from './AbstractAgent'
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

export class CozeAgent extends AbstractAgent {
  private sceret!: CozeSecret
  private jwt!: JWTToken
  private apiClient: CozeAPI | undefined

  constructor() {
    super()
    this.sceret =
      this.secretAssistant.getSecret<CozeSecret>('coze_oauth_config')
    this.initClient()
  }

  private async initClient() {
    if (!this.isExpired() && !this.apiClient) return
    try {
      await this.getJwt()
    } catch (error) {
      console.error('Failed to get JWT OAuth token:', error)
      throw error
    }
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
      throw error
    }
  }

  public async generateI18nKey<T extends CozeAgentI18nKeyResult>(
    parmas?: ZGenI18nKey
  ): Promise<T | null> {
    try {
      if (!parmas)
        throw new Error('Failed to generate i18n key: Missing parameters')
      await this.initClient()
      console.log(
        'parmas',
        transform(
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
      )
      const response = this.apiClient?.workflows.runs.stream({
        workflow_id: '7514668272895213594',
        parameters:
          transform(
            parmas,
            (result, val, key) => {
              if (key === 'tagI18nKey') {
                result['tag_i18n_key'] = val
                return
              }
              result[snakeCase(key)] = val
            },
            {} as Record<string, any>
          ) || {},
      })
      if (!response)
        throw new Error(
          'Failed to generate i18n key: apiClient response is undefined'
        )
      // eslint-disable-next-line no-async-promise-executor
      return new Promise(async (resolve, reject) => {
        let result: T | null = null
        for await (const evt of response) {
          if (evt.event === WorkflowEventType.ERROR) {
            const data = evt.data as WorkflowEventError
            reject(
              new Error(`Failed to generate i18n key: ${data.error_message}`)
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
          if (evt.event === WorkflowEventType.DONE) {
            resolve(result)
          }
        }
      })
    } catch (error) {
      console.error('Failed to generate i18n key:', error)
      throw error
    }
  }
}
