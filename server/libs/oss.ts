import type { AbstractOSS } from './oss/AbstractOSS'
import { LocalOSS } from './oss/LocalOSS'
import { QiniuOSS } from './oss/QiniuOSS'
import { OSSEngine } from '#shared/constants'

class OSSManager {
  private static instance: OSSManager
  private engineType: OSSEngine =
    (process.env.NUXT_OSS_ENGINE_TYPE as OSSEngine) || OSSEngine.LOCAL
  private oss!: AbstractOSS

  private constructor() {
    if (this.engineType === OSSEngine.QINIU) {
      this.oss = new QiniuOSS()
    } else if (this.engineType === OSSEngine.LOCAL) {
      this.oss = new LocalOSS()
    }
  }

  public generateUploadToken() {
    return this.oss.generateUploadToken()
  }

  public generateDownloadAccessUrl(key: string, deadline?: number) {
    return this.oss.generateDownloadAccessUrl(key, deadline)
  }

  public uploadAsset(filename: string, buffer: Buffer): Promise<string> {
    return this.oss.uploadAsset(filename, buffer)
  }

  public deleteAsset(key: string): Promise<boolean> {
    return this.oss.deleteAsset(key)
  }

  // singleton pattern
  public static getInstance(): OSSManager {
    if (!this.instance) {
      this.instance = new OSSManager()
    }
    return this.instance
  }
}

export default OSSManager.getInstance()
