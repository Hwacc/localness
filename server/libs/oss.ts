import type { BaseOSS } from './oss/BaseOSS'
import { LocalOSS } from './oss/LocalOSS'
import { QiniuOSS } from './oss/QiniuOSS'

enum EngineTypes {
  LOCAL = 'LOCAL',
  CLOUDFLARE = 'CLOUDFLARE',
  QINIU = 'QINIU',
}

class OSSManager {
  private static instance: OSSManager
  private engineType: EngineTypes =
    (process.env.NUXT_OSS_ENGINE_TYPE as EngineTypes) || EngineTypes.LOCAL
  private oss!: BaseOSS

  private constructor() {
    if (this.engineType === EngineTypes.QINIU) {
      this.oss = new QiniuOSS()
    } else if (this.engineType === EngineTypes.LOCAL) {
      this.oss = new LocalOSS()
    }
  }

  public generateUploadToken() {
    if (this.engineType === EngineTypes.QINIU) {
      return this.oss.generateUploadToken()
    }
    return ''
  }

  public generateDownloadAccessUrl(key: string, deadline?: number) {
    if (this.engineType === EngineTypes.QINIU) {
      return this.oss.generateDownloadAccessUrl(key, deadline)
    }
    return ''
  }

  public uploadAsset(filename: string, buffer: Buffer): Promise<string> {
    if (this.engineType === EngineTypes.QINIU) {
      return this.oss.uploadAsset(filename, buffer)
    }
    if (this.engineType === EngineTypes.LOCAL) {
      return this.oss.uploadAsset(filename, buffer)
    }
    return Promise.resolve('')
  }

  public deleteAsset(key: string): Promise<boolean> {
    if (this.engineType === EngineTypes.QINIU) {
      return this.oss.deleteAsset(key)
    }
    return Promise.resolve(false)
  }

  public static getInstance(): OSSManager {
    if (!this.instance) {
      this.instance = new OSSManager()
    }
    return this.instance
  }
}

export default OSSManager.getInstance()
