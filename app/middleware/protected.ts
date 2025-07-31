export default defineNuxtRouteMiddleware(async () => {
  if (import.meta.server) return
  const { loggedIn } = useUserSession()
  if (!loggedIn.value) {
    return navigateTo('/')
  }
})
