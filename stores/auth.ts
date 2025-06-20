import type { IUser } from '~/types/interfaces'
import { useStorage } from '@vueuse/core'

export const useAuthStore = defineStore('auth', () => {
  const user = ref<IUser | null>(null)
  const token = ref<string | null>(null)
  const isAuthenticated = ref<boolean>(false)
  const loading = ref<boolean>(false)

  const storageToken = useStorage<string | null>('token', null)
  const storageUser = useStorage<IUser | null>('user', null)

  function setUser(u: IUser) {
    user.value = u
    storageUser.value = u
  }

  function setToken(t: string) {
    token.value = t
    storageToken.value = t
    isAuthenticated.value = true
  }

  function clearAuth() {
    user.value = null
    token.value = null
    isAuthenticated.value = false
    storageToken.value = null
    storageUser.value = null
  }

  async function login(username: string, password: string) {
    const data = await useApi<{ token: string; user: IUser }>(
      '/api/auth/login',
      {
        method: 'POST',
        body: {
          username,
          password,
        },
      }
    )
    if (data) {
      setToken(data.token)
      setUser(data.user)
    }
  }

  async function logout() {
    try {
      if (!storageToken.value) return
      await useApi('/api/auth/logout', {
        method: 'POST',
      })
    } finally {
      clearAuth()
      await navigateTo('/')
    }
  }

  async function checkAuth() {
    try {
      loading.value = true
      if (!storageToken.value) return false
      const { success, user, token } = await useApi<{
        success: boolean
        token: string
        user: IUser
      }>('/api/auth/me', {
        headers: {
          Authorization: `Bearer ${storageToken.value}`,
        },
        method: 'POST',
        body: {},
      })
      if (success) {
        setToken(token)
        setUser(user)
      }
      return success
    } catch {
      clearAuth()
      return false
    } finally {
      loading.value = false
    }
  }

  return {
    user,
    token,
    isAuthenticated,
    loading,
    setUser,
    setToken,
    clearAuth,
    login,
    logout,
    checkAuth,
  }
})
