import qiniu from 'qiniu'
import { AbstractOSS } from './AbstractOSS'

export class QiniuOSS extends AbstractOSS {
  private mac: qiniu.auth.digest.Mac
  private bucketManager: qiniu.rs.BucketManager
  private putPolicy: qiniu.rs.PutPolicy
  private domain: string

  constructor() {
    super()
    this.mac = new qiniu.auth.digest.Mac(
      process.env.NUXT_OSS_ACCESS_KEY,
      process.env.NUXT_OSS_SCRERT_KEY
    )
    const options = {
      scope: 'coze-i18n',
      expires: 3600,
      returnBody:
        '{"key":"$(key)","hash":"$(etag)","fsize":$(fsize),"bucket":"$(bucket)","name":"$(x:name)"}',
    }

    const config = new qiniu.conf.Config()

    this.putPolicy = new qiniu.rs.PutPolicy(options)
    this.bucketManager = new qiniu.rs.BucketManager(this.mac, config)
    this.domain = process.env.NUXT_PUBLIC_OSS_DOMAIN || ''
  }

  generateUploadToken(): string {
    return this.putPolicy.uploadToken(this.mac)
  }

  generateDownloadAccessUrl(key: string, deadline: number = 1): string {
    if (!this.domain) {
      return ''
    }
    const _deadline = Math.floor(Date.now() / 1000) + 3600 * deadline
    const url = this.bucketManager.privateDownloadUrl(
      this.domain,
      key,
      _deadline
    )
    return url
  }

  uploadAsset(): Promise<string> {
    // we use frontend sdk to upload
    throw new Error('Method not implemented')
  }

  async deleteAsset(key: string): Promise<boolean> {
    try {
      const { resp } = await this.bucketManager.delete('coze-i18n', key)
      /**
       * code 200: delete success
       * code 612: means asset not found
       */
      if (resp.statusCode === 200 || resp.statusCode === 612) {
        return true
      }
      return false
    } catch (error) {
      console.error('qiniu delete assets error: ', error)
      return false
    }
  }
}
