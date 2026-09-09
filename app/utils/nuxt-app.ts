import { tryUseNuxtApp } from '#app'

export function runInNuxtApp<T>(fn: () => T): T | undefined {
  const nuxtApp = tryUseNuxtApp()
  if (!nuxtApp) return undefined
  return nuxtApp.runWithContext(fn)
}
