import { useAuthStore } from '~/stores/auth'

export default defineNuxtRouteMiddleware(async () => {
  if (import.meta.server) return
  const authStore = useAuthStore()
  if (!authStore.loggedIn) {
    return navigateTo('/')
  }
})
