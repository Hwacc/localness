import { AbstractOSS } from './AbstractOSS'
import fs from 'node:fs'
import path from 'node:path'
import { PassThrough, pipeline } from 'node:stream'
import { OSSEngine } from '#shared/constants'
class PublicFolderAssitant {
  private resourcesPath: string = path.resolve(process.cwd(), 'runtime/uploads')
  constructor() {
    console.log('LocalOSS ResourcesPath:', this.resourcesPath)
    // create public folder
    if (!fs.existsSync(this.resourcesPath)) {
      fs.mkdirSync(this.resourcesPath, {
        recursive: true,
      })
    }
  }

  write(filename: string, buffer: Buffer): Promise<string> {
    const fullpath = path.join(this.resourcesPath, filename)
    const writeStream = fs.createWriteStream(fullpath)
    const readStream = new PassThrough().end(buffer)
    return new Promise((resolve, reject) => {
      pipeline(readStream, writeStream, (err) => {
        if (err) {
          reject(err)
        }
        resolve(fullpath)
      })
    })
  }

  delete(key: string): Promise<boolean> {
    const fullpath = path.join(this.resourcesPath, key)
    if (fs.existsSync(fullpath)) {
      fs.unlinkSync(fullpath)
      return Promise.resolve(true)
    }
    return Promise.resolve(false)
  }
}

export class LocalOSS extends AbstractOSS {
  private publicAssitant = new PublicFolderAssitant()
  generateUploadToken(): string {
    // we dont need upload token for local oss, use user session judge instead
    return OSSEngine.LOCAL
  }
  generateDownloadAccessUrl(): string {
    // we dont need download access
    return OSSEngine.LOCAL
  }
  uploadAsset(filename: string, buffer: Buffer): Promise<string> {
    if (!buffer) {
      throw new Error('LocalOSS uploadAsset: Buffer is required')
    }
    return this.publicAssitant.write(filename, buffer)
  }
  deleteAsset(key: string): Promise<boolean> {
    return this.publicAssitant.delete(key)
  }
}
