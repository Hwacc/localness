<script setup lang="ts">
import type { ImageUploader } from '#components'
import { z } from 'zod/v4'
import type { IUser } from '~/types/interfaces'

const userStore = useUserStore()
const tabsItems = [
  {
    label: 'Profile',
    desc: '',
    icon: 'i-lucide:user',
    slot: 'profile',
  },
  {
    label: 'Account',
    desc: 'Change password successfully will log you out to login again.',
    icon: 'i-lucide:lock',
    slot: 'account',
  },
]

const emit = defineEmits<{
  close: [boolean]
}>()

const switch2Link = ref(false)
const zProfile = z.object({
  nickname: z.string().min(3).nullable().optional(),
  email: z.email().nullable().optional(),
  avatar: z.string().nullable().optional(),
})
type ZProfile = z.output<typeof zProfile>
const profileState = reactive<ZProfile>({
  nickname: userStore.user.nickname,
  email: userStore.user.email,
  avatar: userStore.user.avatar,
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
}

const showPwdFlag = reactive({
  pwd: false,
  newPwd: false,
  confirmPwd: false,
})
const zAuth = z.object({
  pwd: z.string().min(3),
  newPwd: z.string().min(3),
  confirmPwd: z
    .string()
    .check(({ value, issues }) => {
      console.log(value, authState.newPwd)
      if (value !== authState.newPwd) {
        issues.push({
          code: 'custom',
          message: 'Passwords do not match',
          input: value,
        })
      }
    }),
})
type ZAuth = z.output<typeof zAuth>
const authState = reactive<ZAuth>({
  pwd: '',
  newPwd: '',
  confirmPwd: '',
})
function onAuthSubmit() {
  console.log('auth state', authState)
}
</script>

<template>
  <UModal
    title="User Settings"
    :close="{ onClick: () => emit('close', false) }"
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
                <div class="flex items-center gap-2 text-sm text-gray-500">
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
                <p class="text-xs text-gray-500 text-center">Max 1MB</p>
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
              <UButton type="submit" label="Save" />
            </div>
          </UForm>
        </template>
        <template #account="{ item }">
          <div class="flex flex-col gap-3 pt-2.5">
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
              <UFormField label="Password" name="password">
                <UInput
                  v-model="authState.pwd"
                  class="w-full"
                  :type="showPwdFlag.pwd ? 'text' : 'password'"
                >
                  <template #trailing>
                    <UIcon
                      :name="
                        showPwdFlag.pwd ? 'i-lucide-eye-off' : 'i-lucide-eye'
                      "
                      @click="showPwdFlag.pwd = !showPwdFlag.pwd"
                    />
                  </template>
                </UInput>
              </UFormField>
              <UFormField label="Confirm password" name="password2">
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
              <UFormField label="Confirm password" name="password2">
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
                <UButton type="submit" label="Save" />
              </div>
            </UForm>
          </div>
        </template>
      </UTabs>
    </template>
  </UModal>
</template>
