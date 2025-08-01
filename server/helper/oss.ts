import { OSSEngine } from '#shared/constants'
import { resolve } from 'node:path'
import { createStorage } from 'unstorage'
import fsDriver from 'unstorage/drivers/fs'

export function createOSSStorage() {
  const engineType: OSSEngine =
    (process.env.NUXT_PUBLIC_OSS_ENGINE as OSSEngine) || OSSEngine.LOCAL

  const driver = fsDriver({
    base: resolve(process.cwd(), 'runtime/uploads'),
  })

  switch (engineType) {
    case OSSEngine.LOCAL:
    default:
      break
    case OSSEngine.QINIU:
      // TODO: custom a qiniu driver
      break
  }
  return createStorage({
    driver,
  })
}
