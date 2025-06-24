import type { IUser } from '~/types/interfaces'
import { User } from '~/types/User'

export const useUserStore = defineStore('user', () => {
  const user = ref<IUser>(new User())

  async function getUser() {
    const res = await useApi<IUser>('/api/user')
    if (res) {
      user.value = res
    }
  }
  return { user, getUser }
})
