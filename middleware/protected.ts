import { useAuthStore } from '~/stores/auth'

export default defineNuxtRouteMiddleware(async () => {
  if (import.meta.server) return
  const { user, checkAuth } = useAuthStore()
  await checkAuth()
  if (!user) {
    return navigateTo('/')
  }
})
