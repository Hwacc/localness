import type { IUser } from '~/types/User'
import { User } from '~/types/User'
import { merge } from 'lodash-es'

export const useUserStore = defineStore('user', () => {
  const toast = useToast()
  const user = ref<IUser>(new User())

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