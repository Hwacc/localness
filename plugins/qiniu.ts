import { qiniuDirective } from "~/directives/qiniu"

export default defineNuxtPlugin((NuxtApp) => {
  NuxtApp.vueApp.directive('qiniu', qiniuDirective)
})