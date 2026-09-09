import { merge } from 'lodash-es'
import { UserRole } from '#shared/constants'

function emptyUser(): IUser {
  return {
    id: 0,
    username: '',
    role: UserRole.GUEST,
    projects: [],
    ownProjects: [],
  }
}

export const useUserStore = defineStore('user', () => {
  const toast = useToast()
  const user = ref<IUser>(emptyUser())

  async function getUser() {
    const res = await useApi<IUser>('/api/user')
    if (res) {
      user.value = res
    }
  }
  
  async function updateUser(
    _user: Pick<IUser, 'nickname' | 'email' | 'avatar'>
  ) {
    const res = await useApi<Partial<IUser>>('/api/user', {
      method: 'POST',
      body: _user,
    })
    if (!res) return
    user.value = merge(user.value, res)
    if (import.meta.client) {
      toast.add({
        title: 'Success',
        description: 'User updated successfully',
        color: 'success',
        icon: 'i-lucide:circle-check',
      })
    }
  }
  return { user, getUser, updateUser }
})


export type UserStore = ReturnType<typeof useUserStore>