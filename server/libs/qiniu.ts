import qiniu from 'qiniu'

const mac = new qiniu.auth.digest.Mac(
  process.env.NUXT_QINIU_ACCESS_KEY,
  process.env.NUXT_QINIU_SCRERT_KEY
)
const options = {
  scope: 'coze-i18n',
  expires: 3600,
  returnBody:
    '{"key":"$(key)","hash":"$(etag)","fsize":$(fsize),"bucket":"$(bucket)","name":"$(x:name)"}',
}
const putPolicy = new qiniu.rs.PutPolicy(options)
/**
 * generate qiniu upload token
 */
export function generateUploadToken() {
  return putPolicy.uploadToken(mac)
}

const config = new qiniu.conf.Config()
const bucketManager = new qiniu.rs.BucketManager(mac, config)
const privateBucketDomain = process.env.NUXT_PUBLIC_QINIU_DOMAIN
/**
 * generate qiniu download access url
 * @param key qiniu asset key
 * @param deadline deadline in hour
 */
export function generateDownloadAccessUrl(key: string, deadline: number = 1) {
  if (!privateBucketDomain) {
    return ''
  }
  const _deadline = Math.floor(Date.now() / 1000) + 3600 * deadline
  const url = bucketManager.privateDownloadUrl(
    privateBucketDomain,
    key,
    _deadline
  )
  return url
}
/**
 * delete qiniu asset
 * @param key qiniu asset key
 * @returns true if delete success
 */
export async function deleteAsset(key: string) {
  try {
    const { resp } = await bucketManager.delete('coze-i18n', key)
    /**
     * code 200: delete success
     * code 612: means asset not found
     */
    if (resp.statusCode === 200 || resp.statusCode === 612) {
      return true
    }
    return false
  } catch (error) {
    console.error('deleteAsset', error)
    return false
  }
}
