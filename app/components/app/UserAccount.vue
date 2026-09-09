<script setup lang="ts">
import { UserModal } from '#components'
import { hasProtocol } from 'ufo'

const authStore = useAuthStore()
const store = useUserStore()
const overlay = useOverlay()
const ossImage = useOSSImage()
const { loggedIn } = useUserSession()

const avatarUrl = ref('')

watchEffect(async () => {
  const storeUrl = store.user?.avatar
  if (!storeUrl) {
    avatarUrl.value = ''
    return
  }
  if (hasProtocol(storeUrl)) {
    avatarUrl.value = storeUrl
    return
  }
  avatarUrl.value = await ossImage.get(storeUrl)
})

const displayName = computed(
  () => store.user?.nickname || store.user?.username || 'Account'
)

const userModal = overlay.create(UserModal, {
  props: {},
})

function openProfile() {
  userModal.open()
}

function logout() {
  authStore.logout()
}

onMounted(async () => {
  if (loggedIn.value) {
    await store.getUser()
  }
})
</script>

<template>
  <UPopover
    :content="{ side: 'right', align: 'end', sideOffset: 8 }"
    :ui="{ content: 'w-64 p-0' }"
  >
    <UTooltip :text="displayName" :content="{ side: 'right' }">
      <button
        type="button"
        class="rounded-full outline-none focus-visible:ring-2 focus-visible:ring-primary"
      >
        <UAvatar :src="avatarUrl || undefined" :alt="displayName" size="sm" />
      </button>
    </UTooltip>
    <template #content>
      <div class="p-3">
        <div class="flex items-center gap-3 min-w-0">
          <UAvatar :src="avatarUrl || undefined" :alt="displayName" size="lg" />
          <div class="min-w-0">
            <p class="font-medium truncate">{{ displayName }}</p>
            <p class="text-xs text-muted truncate">
              {{ store.user?.email || '—' }}
            </p>
          </div>
        </div>
        <div class="mt-3 flex flex-col gap-1">
          <UButton
            color="neutral"
            variant="ghost"
            block
            class="justify-start"
            icon="i-lucide:user"
            label="Profile"
            @click="openProfile"
          />
          <UButton
            color="neutral"
            variant="ghost"
            block
            class="justify-start"
            icon="i-lucide:log-out"
            label="Logout"
            @click="logout"
          />
        </div>
      </div>
    </template>
  </UPopover>
</template>
