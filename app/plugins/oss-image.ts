import { ossImageDirective } from '~/directives/ossImage'

export default defineNuxtPlugin((NuxtApp) => {
  NuxtApp.vueApp.directive('oss-image', ossImageDirective)
})
