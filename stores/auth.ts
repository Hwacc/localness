import type { IUser } from '~/types/interfaces'

export const useAuthStore = defineStore('auth', () => {
  const {
    loggedIn,
    user,
    session,
    clear,
    fetch: refreshSession,
  } = useUserSession()

  async function login(username: string, password: string): Promise<boolean> {
    const res = await useApi<{ user: IUser }>('/login', {
      method: 'POST',
      body: {
        username,
        password,
      },
    })
    if (res && res.user) {
      await refreshSession()
      console.log('res.user', session.value)
      return loggedIn.value
    }
    return false
  }

  async function logout() {
    try {
      if (!loggedIn.value) return
      await useApi('/logout', { method: 'POST' })
    } finally {
      clear()
      await navigateTo('/')
    }
  }

  return {
    user,
    loggedIn,
    login,
    logout,
    clear,
    session,
    refreshSession,
  }
})

export type AuthStore = ReturnType<typeof useAuthStore>
