import type { IUser } from '~/types/interfaces'

export const useAuthStore = defineStore('auth', () => {
  const toast = useToast()

  const user = ref<IUser | null>(null)
  const token = ref<string | null>(null)
  const isAuthenticated = ref<boolean>(false)
  const loading = ref<boolean>(false)

  function setUser(u: IUser) {
    user.value = u
    isAuthenticated.value = true
  }

  function setToken(t: string) {
    token.value = t
    if (t) {
      localStorage.setItem('token', t)
    }
  }

  function clearAuth() {
    user.value = null
    token.value = null
    isAuthenticated.value = false
    localStorage.removeItem('token')
  }

  async function login(email: string, password: string) {
    const { data } = await useFetch<{ token: string; user: IUser }>(
      '/api/auth/login',
      {
        method: 'POST',
        body: {
          email,
          password,
        },
        headers: {
          'Content-Type': 'application/json',
        },
        onResponseError({ response }) {
          const error = response._data || 'An error occurred'
          const errorMessage =
            error.message ||
            error.statusMessage ||
            'Request failed, please try again later'
          if (import.meta.client) {
            toast.add({
              title: 'Error',
              description: errorMessage,
              icon: 'i-lucide:circle-x',
              color: 'error',
            })
          }
        },
      }
    )
    console.log('login response:', data.value)
    if (data.value) {
      setToken(data.value.token)
      setUser(data.value.user)
    }
  }

  async function logout() {
    try {
      const token = localStorage.getItem('token')
      if (!token) return
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
      const token = localStorage.getItem('token')
      if (!token) return false

      const { data } = await useApi<IUser>('/api/auth/me', {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      })
      if (data.value) {
        setToken(token)
        setUser(data.value)
      }
      return true
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
