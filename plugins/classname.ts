import { cn } from '~/utils'

export default defineNuxtPlugin((nuxtApp) => {
  nuxtApp.vueApp.config.globalProperties.$cn = cn
  return {
    provide: {
      cn: cn,
    },
  }
})
