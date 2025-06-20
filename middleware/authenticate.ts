import { useAuthStore } from '~/stores/auth'

export default defineNuxtRouteMiddleware(async () => {
  if (import.meta.server) return
  const { isAuthenticated, checkAuth } = useAuthStore()
  const verified = await checkAuth()
  console.log('isAuthenticated', isAuthenticated)
  if (verified) {
    return navigateTo('/editor')
  }
})
