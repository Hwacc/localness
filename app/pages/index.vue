<script setup lang="ts">
import { z } from 'zod/v4'
import { useStorage } from '@vueuse/core'
import { AnimatePresence, motion } from 'motion-v'

definePageMeta({
  middleware: ['index-auth'],
  layout: 'welcome',
})

const { login } = useAuthStore()
const toast = useToast()
const route = useRoute()

const startFlag = useStorage('get-start', false)
function onStart() {
  startFlag.value = true
}

const showPassword = ref(false)
const zLogin = z.object({
  username: z
    .string()
    .min(1, 'Please enter your username')
    .min(3, 'Username needs at least 3 characters'),
  password: zPassword,
})
type ZLogin = z.infer<typeof zLogin>
const state = reactive<ZLogin>({ username: '', password: '' })

const { data: providers } = await useFetch<{ atlassian: boolean }>(
  '/api/auth/providers'
)
const atlassianReady = computed(() => Boolean(providers.value?.atlassian))

async function onSubmit() {
  const success = await login(state.username, state.password)
  if (success) {
    await navigateTo('/transfer')
  }
}

function continueWithAtlassian() {
  if (!atlassianReady.value) return
  window.location.href = '/auth/atlassian'
}

const oauthErrorCopy: Record<string, string> = {
  atlassian: 'Atlassian sign-in failed. Try again or use username and password.',
  domain: 'That Atlassian email is not allowed to sign in here.',
  no_account_id: 'Atlassian did not return an account. Try again.',
}

onMounted(() => {
  const code = route.query.oauth_error
  if (typeof code !== 'string' || !code) return
  startFlag.value = true
  toast.add({
    title: 'Atlassian sign-in failed',
    description: oauthErrorCopy[code] ?? oauthErrorCopy.atlassian,
    color: 'error',
    icon: 'i-lucide:circle-alert',
  })
  void navigateTo({ path: '/', query: {} }, { replace: true })
})
</script>

<template>
  <ClientOnly>
    <div class="flex flex-col items-center mt-20">
      <AnimatePresence mode="wait">
        <motion.div
          v-if="!startFlag"
          key="start"
          class="flex items-center"
          :transition="{ duration: 0.3 }"
          :initial="{ opacity: 0, scale: 0.8, y: 20 }"
          :animate="{ opacity: 1, scale: 1, y: 0 }"
          :exit="{ opacity: 0, scale: 0.8, y: 20 }"
        >
          <RainbowComponent class="text-inverted rounded-[4px]" @click="onStart">
            Get Start
          </RainbowComponent>
        </motion.div>
        <motion.div
          v-else
          key="login"
          class="relative w-100"
          :transition="{ duration: 0.3 }"
          :initial="{ opacity: 0, scale: 0.8, y: -20 }"
          :animate="{ opacity: 1, scale: 1, y: 0 }"
          :exit="{ opacity: 0, scale: 0.8, y: -20 }"
        >
          <GlowBorder
            :border-radius="4"
            :color="['#A07CFE', '#FE8FB5', '#FFBE7B']"
          />
          <UForm
            class="flex flex-col gap-6 bg-muted rounded-[4px] p-6"
            :schema="zLogin"
            :state="state"
            @submit="onSubmit"
          >
            <UFormField label="Username" name="username">
              <UInput v-model="state.username" class="w-full" size="lg" />
            </UFormField>
            <UFormField label="Password" name="password">
              <UInput
                v-model="state.password"
                class="w-full"
                size="lg"
                :type="showPassword ? 'text' : 'password'"
              >
                <template #trailing>
                  <UButton
                    color="neutral"
                    variant="link"
                    size="sm"
                    :icon="showPassword ? 'i-lucide-eye-off' : 'i-lucide-eye'"
                    @click="showPassword = !showPassword"
                  />
                </template>
              </UInput>
            </UFormField>

            <UButton
              class="w-full justify-center"
              color="primary"
              size="lg"
              label="Login"
              type="submit"
            />
            <div class="flex items-center gap-3 text-xs text-muted">
              <span class="h-px flex-1 bg-default" />
              or
              <span class="h-px flex-1 bg-default" />
            </div>
            <AtlassianButton
              label="Continue with Atlassian"
              :disabled="!atlassianReady"
              @click="continueWithAtlassian"
            />
            <p v-if="!atlassianReady" class="text-xs text-muted text-center">
              Atlassian login is not configured. Contact an admin.
            </p>
          </UForm>
        </motion.div>
      </AnimatePresence>
      <VersionLine class="mt-6" />
    </div>
  </ClientOnly>
</template>
