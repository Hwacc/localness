import type { Plugin } from '#app'
import { ossImageDirective } from '~/directives/ossImage'

const ossImagePlugin: Plugin = defineNuxtPlugin((nuxtApp) => {
  nuxtApp.vueApp.directive('oss-image', ossImageDirective)
})

export default ossImagePlugin
