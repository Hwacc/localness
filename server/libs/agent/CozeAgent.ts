import type { JTWResult } from './AbstractAgent'
import { AbstractAgent } from './AbstractAgent'
import { getJWTToken } from '@coze/api'
import { URL } from 'node:url'

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

  constructor() {
    super()
    this.sceret =
      this.secretAssistant.getSecret<CozeSecret>('coze_oauth_config')
  }

  public async getJwt(): Promise<JTWResult> {
    try {
      const oauthToken = await getJWTToken({
        baseURL: this.sceret.coze_api_base,
        appId: this.sceret.client_id,
        aud: new URL(this.sceret.coze_api_base).host,
        keyid: this.sceret.public_key_id,
        privateKey: this.sceret.private_key,
      })
      console.log('coze oauthToken', oauthToken)
      return {
        token_type: 'Bearer',
        access_token: oauthToken.access_token,
        refresh_token: '',
        expires_in: oauthToken.expires_in,
      }
    } catch (error) {
      console.error('Failed to get JWT OAuth token:', error)
      throw error
    }
  }
}
