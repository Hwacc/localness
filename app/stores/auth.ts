export const useAuthStore = defineStore('auth', () => {
  const toast = useToast()
  const {
    loggedIn,
    user,
    session,
    clear,
    fetch: refreshSession,
  } = useUserSession()
  
  async function login(username: string, password: string): Promise<boolean> {
    try {
      const res = await useApi<{ user: IUser }>('/login', {
        method: 'POST',
        body: {
          username,
          password,
        },
      })
      if (res && res.user) {
        await refreshSession()
        return loggedIn.value
      }
      return false
    } catch (error) {
      console.error(error)
      return false
    }
  }

  async function logout() {
    try {
      if (!loggedIn.value) return
      await useApi('/logout', { method: 'POST' })
    } finally {
      await clear()
      await navigateTo('/')
    }
  }

  async function changePassword(newPassword: string) {
    if (!newPassword) return false
    const res = await useApi<{ success: boolean }>('/api/auth/change', {
      method: 'POST',
      body: {
        password: newPassword,
      },
    })
    if (res && res.success) {
      if (import.meta.client) {
        toast.add({
          title: 'Success',
          description: 'Password changed successfully',
          color: 'success',
          icon: 'i-lucide:circle-check',
        })
      }
      await logout()
      return true
    }
    return false
  }

  return {
    user,
    loggedIn,
    login,
    logout,
    clear,
    session,
    refreshSession,
    changePassword,
  }
})

export type AuthStore = ReturnType<typeof useAuthStore>
