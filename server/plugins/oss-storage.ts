import { createOSSStorage } from "#server/helper/oss"

export default defineNitroPlugin((nitro) => {
  const ossStorage = createOSSStorage()
  nitro.hooks.hook('request', (event) => {
    event.context.ossStorage = ossStorage
  })
})