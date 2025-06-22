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

export function generateUploadToken() {
  console.log(
    'generateUploadToken',
    process.env.NUXT_QINIU_ACCESS_KEY,
    process.env.NUXT_QINIU_SCRERT_KEY
  )
  return putPolicy.uploadToken(mac)
}

const config = new qiniu.conf.Config()
config.zone = qiniu.zone.Zone_z2
const bucketManager = new qiniu.rs.BucketManager(mac, config)
const privateBucketDomain = process.env.NUXT_QINIU_PRIVATE_DOMAIN
const deadline = Date.now() / 1000 + 3600 * 24 * 30

export function generateDownloadUrl(key: string) {
  if (!privateBucketDomain) {
    return ''
  }
  return bucketManager.privateDownloadUrl(privateBucketDomain, key, deadline)
}
