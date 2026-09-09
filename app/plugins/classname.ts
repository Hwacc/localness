import type { Plugin } from '#app'
import { cn } from '#shared/utils'

const classnamePlugin: Plugin<{ cn: typeof cn }> = defineNuxtPlugin((nuxtApp) => {
  nuxtApp.vueApp.config.globalProperties.$cn = cn
  return {
    provide: {
      cn,
    },
  }
})

export default classnamePlugin
