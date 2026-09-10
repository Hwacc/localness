import { tryUseNuxtApp } from '#app'

export function runInNuxtApp<T>(fn: () => T) {
  const nuxtApp = tryUseNuxtApp()
  if (!nuxtApp) return undefined
  return nuxtApp.runWithContext(fn)
}
