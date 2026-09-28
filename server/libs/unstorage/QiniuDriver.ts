import { defineDriver } from 'unstorage'
import qiniu from 'qiniu'
import { IMAGE_MAX_BYTES } from '#shared/constants'

interface QiniuDriverOptions {
  domain: string
  accessKey: string
  secretKey: string
  bucket: string
  region?: string
  deadline?: number // hours
}

const DRIVER_NAME = 'qiniu'

export const qiniuDriver = defineDriver((options: QiniuDriverOptions) => {
  let _qiniuPolicy: qiniu.rs.PutPolicy
  let _qiniuClient: qiniu.rs.BucketManager

  if (!options.accessKey) {
    throw createRequiredError(DRIVER_NAME, 'accessKey')
  }
  if (!options.secretKey) {
    throw createRequiredError(DRIVER_NAME, 'secretKey')
  }
  const mac = new qiniu.auth.digest.Mac(options.accessKey, options.secretKey)
  const getQiniuClient = () => {
    if (!_qiniuClient) {
      const config = new qiniu.conf.Config()
      _qiniuClient = new qiniu.rs.BucketManager(mac, config)
    }
    return _qiniuClient
  }
  const getQiniuPutPolicy = () => {
    if (!_qiniuPolicy) {
      const _putOptions = {
        scope: options.bucket,
        expires: 3600,
        /**
         * The client uploads straight to Qiniu, so the server never sees these
         * bytes and the policy is the only place a limit can be enforced. One
         * token covers both images and skill packages, so it carries the looser
         * of the two limits; the per-kind limit is applied by
         * `server/helper/upload.ts` on the LOCAL path.
         *
         * No `mimeLimit`: it checks the Content-Type the client declares, and
         * the client holds this token, so it is not a boundary — it would only
         * reject honest uploads of types browsers label inconsistently. The
         * extension is constrained instead, by `uuidFilename` deriving it from
         * the real last dot. Scoping the token to one exact key is the remaining
         * gap on this path.
         */
        fsizeLimit: IMAGE_MAX_BYTES,
        returnBody:
          '{"key":"$(key)","hash":"$(etag)","fsize":$(fsize),"bucket":"$(bucket)","name":"$(x:name)"}',
      }
      _qiniuPolicy = new qiniu.rs.PutPolicy(_putOptions)
    }
    return _qiniuPolicy
  }

  return {
    name: DRIVER_NAME,
    options,
    async hasItem(key) {
      try {
        const { resp } = await getQiniuClient().stat(options.bucket, key)
        return resp.statusCode === 200
      } catch (error) {
        console.error('qiniu stat assets error: ', error)
        return false
      }
    },
    async getItem(key, _opts?: any) {
      const deadline = options.deadline || _opts?.deadline || 1
      const _deadline = Math.floor(Date.now() / 1000) + 3600 * deadline
      const url = getQiniuClient().privateDownloadUrl(
        options.domain,
        key,
        _deadline
      )
      return url
    },
    async setItem() {
      throw createError(DRIVER_NAME, 'setItem is not supported')
    },
    async removeItem(key) {
      try {
        await getQiniuClient().delete(options.bucket, key)
      } catch (error) {
        console.error('qiniu delete assets error: ', error)
        throw createError(DRIVER_NAME, 'removeItem error: ' + error)
      }
    },
    async getKeys() {
      throw createError(DRIVER_NAME, 'getKeys is not supported')
    },
    async clear() {
      throw createError(DRIVER_NAME, 'clear is not supported')
    },
    getPutToken() {
      return getQiniuPutPolicy().uploadToken(mac)
    },
  }
})

function createError(driver: string, message: string, opts?: ErrorOptions) {
  const err = new Error(`[unstorage] [${driver}] ${message}`, opts)
  if (Error.captureStackTrace) {
    Error.captureStackTrace(err, createError)
  }
  return err
}

function createRequiredError(driver: string, name: string | string[]) {
  if (Array.isArray(name)) {
    return createError(
      driver,
      `Missing some of the required options ${name
        .map((n) => '`' + n + '`')
        .join(', ')}`
    )
  }
  return createError(driver, `Missing required option \`${name}\`.`)
}
