import type { Plugin } from '#app'
import { sortableDirective } from '~/directives/sortable'

const sortablePlugin: Plugin = defineNuxtPlugin((nuxtApp) => {
  nuxtApp.vueApp.directive('sortable', sortableDirective)
})

export default sortablePlugin
