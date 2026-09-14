<script setup lang="ts">
import type { ImageUploader } from '#components'
import { z } from 'zod/v4'

const userStore = useUserStore()
const hasPasswordSet = computed(() => userStore.user.hasPasswordSet !== false)
const tabsItems = computed(() => [
  {
    label: 'Profile',
    desc: '',
    icon: 'i-lucide:user',
    slot: 'profile',
  },
  {
    label: 'Account',
    desc: hasPasswordSet.value
      ? 'Change password successfully will log you out to login again.'
      : 'Set a password to also sign in with username. You will be logged out after saving.',
    icon: 'i-lucide:lock',
    slot: 'account',
  },
])

const emit = defineEmits<{
  close: [boolean]
}>()

const switch2Link = ref(false)
const zProfile = z.object({
  nickname: z.string().min(3).nullable().optional(),
  email: z.email().nullable().optional(),
  avatar: z.string().nullable().optional(),
})
const profileState = reactive({
  nickname: userStore.user.nickname ?? undefined,
  email: userStore.user.email ?? undefined,
  avatar: userStore.user.avatar ?? undefined,
})
const avatarUploader =
  useTemplateRef<InstanceType<typeof ImageUploader>>('avatarUploader')
async function onProfileSubmit() {
  if (!switch2Link.value) {
    const res = await avatarUploader.value?.upload()
    if (res) profileState.avatar = res.key
  }
  await userStore.updateUser(
    profileState as Pick<IUser, 'nickname' | 'email' | 'avatar'>
  )
  emit('close', true)
}

const authStore = useAuthStore()
const showPwdFlag = reactive({
  newPwd: false,
  confirmPwd: false,
})
const zAuth = z.object({
  newPwd: zPassword,
  confirmPwd: zPassword.check(({ value, issues }) => {
    if (value !== authState.newPwd) {
      issues.push({
        code: 'custom',
        message: 'Passwords do not match',
        input: value,
      })
    }
  }),
})
type ZAuth = z.infer<typeof zAuth>
const authState = reactive<ZAuth>({
  newPwd: '',
  confirmPwd: '',
})
async function onAuthSubmit() {
  await authStore.changePassword(authState.newPwd)
  emit('close', true)
}

const atlassianReady = ref(false)
const atlassian = computed(
  () => userStore.user.atlassian ?? { connected: false }
)

onMounted(async () => {
  try {
    const res = await $fetch<{ atlassian: boolean }>('/api/auth/providers')
    atlassianReady.value = Boolean(res?.atlassian)
  } catch {
    atlassianReady.value = false
  }
})

function connectAtlassian() {
  if (!atlassianReady.value) return
  window.location.href = '/auth/atlassian'
}
</script>

<template>
  <UModal
    title="User Settings"
    @update:open="(isOpen) => !isOpen && emit('close', false)"
  >
    <template #body>
      <UTabs :items="tabsItems" variant="link" :ui="{ trigger: 'grow' }">
        <template #profile>
          <UForm
            class="flex flex-col gap-3 pt-2.5"
            :state="profileState"
            :schema="zProfile"
            @submit="onProfileSubmit"
          >
            <UFormField label="Nickname" name="nickname">
              <UInput v-model="profileState.nickname" class="w-full" />
            </UFormField>
            <UFormField label="Email" name="email">
              <UInput v-model="profileState.email" class="w-full" />
            </UFormField>
            <UFormField label="Avatar" name="avatar">
              <template #hint>
                <div class="flex items-center gap-2 text-sm text-muted">
                  <span>Link</span>
                  <USwitch v-model="switch2Link" />
                </div>
              </template>
              <div v-if="!switch2Link" class="w-full flex flex-col gap-1">
                <ImageUploader
                  ref="avatarUploader"
                  class="w-[200px] self-center"
                  :limit-size="1024 * 1024"
                  :url="profileState.avatar"
                />
                <p class="text-xs text-muted text-center">Max 1MB</p>
              </div>
              <UInput
                v-if="switch2Link"
                v-model="profileState.avatar"
                class="w-full"
                placeholder="https://www.example.com/image.png"
              />
            </UFormField>
            <div class="w-full flex items-center justify-end gap-6">
              <UButton
                color="neutral"
                variant="ghost"
                label="Cancel"
                @click="emit('close', false)"
              />
              <UButton type="submit" label="Save" icon="i-lucide-save" />
            </div>
          </UForm>
        </template>
        <template #account="{ item }">
          <div class="flex flex-col gap-3 pt-2.5">
            <div class="rounded-lg border border-default p-3 flex flex-col gap-2">
              <p class="text-sm font-medium">Atlassian</p>
              <template v-if="atlassian.connected">
                <p class="text-sm text-muted">Connected</p>
                <p v-if="atlassian.displayName" class="text-sm">
                  {{ atlassian.displayName }}
                </p>
                <p v-if="atlassian.email" class="text-sm text-muted">
                  {{ atlassian.email }}
                </p>
              </template>
              <template v-else>
                <AtlassianButton
                  label="Connect Atlassian"
                  :disabled="!atlassianReady"
                  @click="connectAtlassian"
                />
                <p
                  v-if="!atlassianReady"
                  class="text-xs text-muted"
                >
                  Atlassian login is not configured. Contact an admin.
                </p>
              </template>
            </div>
            <UAlert
              variant="soft"
              color="warning"
              title="Notice"
              :description="item.desc"
            />
            <UForm
              class="flex flex-col gap-3"
              :state="authState"
              :schema="zAuth"
              @submit="onAuthSubmit"
            >
              <UFormField
                :label="hasPasswordSet ? 'New password' : 'Set password'"
                name="newPwd"
              >
                <UInput
                  v-model="authState.newPwd"
                  class="w-full"
                  :type="showPwdFlag.newPwd ? 'text' : 'password'"
                >
                  <template #trailing>
                    <UIcon
                      :name="
                        showPwdFlag.newPwd ? 'i-lucide-eye-off' : 'i-lucide-eye'
                      "
                      @click="showPwdFlag.newPwd = !showPwdFlag.newPwd"
                    />
                  </template>
                </UInput>
              </UFormField>
              <UFormField label="Confirm password" name="confirmPwd">
                <UInput
                  v-model="authState.confirmPwd"
                  class="w-full"
                  :type="showPwdFlag.confirmPwd ? 'text' : 'password'"
                >
                  <template #trailing>
                    <UIcon
                      :name="
                        showPwdFlag.confirmPwd
                          ? 'i-lucide-eye-off'
                          : 'i-lucide-eye'
                      "
                      @click="showPwdFlag.confirmPwd = !showPwdFlag.confirmPwd"
                    />
                  </template>
                </UInput>
              </UFormField>
              <div class="w-full flex items-center justify-end gap-6">
                <UButton
                  color="neutral"
                  variant="ghost"
                  label="Cancel"
                  @click="emit('close', false)"
                />
                <UButton
                  type="submit"
                  :label="hasPasswordSet ? 'Save' : 'Set password'"
                  icon="i-lucide-save"
                />
              </div>
            </UForm>
          </div>
        </template>
      </UTabs>
    </template>
  </UModal>
</template>
