<script setup lang="ts">
import { UserModal } from '#components'
import type { DropdownMenuItem } from '@nuxt/ui'

const store = useUserStore()
const overlay = useOverlay()
const qiniuImage = useQiniuImage()

const avartarUrl = ref('')
watch(store.user, async () => {
  const storeUrl = store.user?.avatar
  if (storeUrl) {
    if (/$(http|https)/.test(storeUrl)) avartarUrl.value = storeUrl
    else {
      avartarUrl.value = await qiniuImage.get(storeUrl)
    }
  }
})

const userModal = overlay.create(UserModal, {
  props: {},
})
const userMenuItems: DropdownMenuItem[] = [
  {
    label: 'Profile',
    icon: 'i-lucide:user',
    onSelect: () => {
      userModal.open()
    },
  },
  {
    label: 'Logout',
    icon: 'i-lucide:log-out',
    onSelect: () => {
      
    },  
  },
]
</script>

<template>
  <div class="flex items-center py-4 px-2 gap-2 shadow overflow-hidden">
    <div class="flex-1 flex items-center gap-2 overflow-hidden">
      <UAvatar :src="avartarUrl" />
      <div class="flex-1 flex flex-col">
        <p>{{ store.user?.nickname ?? store.user?.username }}</p>
        <p class="text-xs color-secondary">
          {{ store.user?.email }}
        </p>
      </div>
    </div>
    <UDropdownMenu :items="userMenuItems" :content="{ side: 'top' }">
      <template #default>
        <div
          class="px-1 h-full flex items-center justify-center cursor-pointer text-gray-500 hover:text-black"
        >
          <UIcon name="i-lucide:settings" size="20" />
        </div>
      </template>
    </UDropdownMenu>
  </div>
</template>
