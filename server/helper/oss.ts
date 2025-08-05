import type { Driver } from 'unstorage'
import { OSSEngine } from '#shared/constants'
import { resolve } from 'node:path'
import { createStorage } from 'unstorage'
import fsDriver from 'unstorage/drivers/fs'
import { qiniuDriver } from '../libs/unstorage/QiniuDriver'

export function createOSSStorage() {
  const engineType: OSSEngine =
    (process.env.NUXT_PUBLIC_OSS_ENGINE as OSSEngine) || OSSEngine.LOCAL

  let driver: Driver = fsDriver({
    base: resolve(process.cwd(), 'runtime/uploads'),
  })

  switch (engineType) {
    case OSSEngine.LOCAL:
    default:
      break
    case OSSEngine.QINIU:
      driver = qiniuDriver({
        domain: process.env.NUXT_PUBLIC_OSS_DOMAIN || '',
        accessKey: process.env.NUXT_OSS_ACCESS_KEY || '',
        secretKey: process.env.NUXT_OSS_SCRERT_KEY || '',
        bucket: 'coze-i18n'
      })
      break
  }
  return createStorage({
    driver,
  })
}
