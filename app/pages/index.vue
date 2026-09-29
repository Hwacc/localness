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
const { $dayjs } = useNuxtApp()

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

type LinkInfo =
  | { pending: false }
  | {
      pending: true
      email: string
      accounts: { username: string; nickname: string | null; createdAt: string }[]
      newAccount: { username: string; displayName: string; email: string }
    }

/**
 * Set when the Atlassian account's email matches an existing account: the
 * sign-in is parked server-side until that account's password confirms it.
 */
const link = ref<Extract<LinkInfo, { pending: true }> | null>(null)
const linkUsername = ref('')
const linkPassword = ref('')
const showLinkPassword = ref(false)
const linking = ref(false)
/** Creating a separate account is a step back from linking, so it is confirmed. */
const confirmingCreate = ref(false)

const linkNeedsUsername = computed(() => (link.value?.accounts.length ?? 0) > 1)

// A password typed for one account must not ride along to another.
watch(linkUsername, () => {
  linkPassword.value = ''
})
const linkCanSubmit = computed(
  () =>
    linkPassword.value.length > 0 &&
    (!linkNeedsUsername.value || linkUsername.value !== '')
)

async function loadPendingLink() {
  const info = await $fetch<LinkInfo>('/api/auth/atlassian-link').catch(
    () => null
  )
  if (info && info.pending) {
    link.value = info
    linkUsername.value = ''
    startFlag.value = true
    return
  }
  toast.add({
    title: 'Atlassian sign-in expired',
    description: 'Sign in with Atlassian again.',
    color: 'error',
    icon: 'i-lucide:circle-alert',
  })
}

async function finishLink(action: 'link' | 'create') {
  linking.value = true
  try {
    const res = await useApi<{ user: IUser }>('/api/auth/atlassian-link', {
      method: 'POST',
      body:
        action === 'link'
          ? {
              action,
              password: linkPassword.value,
              ...(linkNeedsUsername.value ? { username: linkUsername.value } : {}),
            }
          : { action },
    })
    if (!res?.user) return
    confirmingCreate.value = false
    await useAuthStore().refreshSession()
    await navigateTo('/transfer')
  } finally {
    linking.value = false
  }
}

onMounted(async () => {
  if (route.query.link === 'atlassian') {
    await navigateTo({ path: '/', query: {} }, { replace: true })
    await loadPendingLink()
    return
  }
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
          <div
            v-if="link && confirmingCreate"
            class="flex flex-col gap-4 bg-muted rounded-[4px] p-6"
          >
            <p class="text-sm">
              Create a separate account instead of linking to the existing one?
            </p>
            <dl
              class="rounded-lg border border-default p-3 grid grid-cols-[6rem_1fr] gap-y-1.5 text-sm"
            >
              <dt class="text-muted">Username</dt>
              <dd class="font-medium break-all">
                {{ link.newAccount.username }}
              </dd>
              <template v-if="link.newAccount.displayName">
                <dt class="text-muted">Name</dt>
                <dd class="break-all">{{ link.newAccount.displayName }}</dd>
              </template>
              <dt class="text-muted">Email</dt>
              <dd class="break-all">{{ link.newAccount.email || '—' }}</dd>
              <dt class="text-muted">Sign-in</dt>
              <dd>Atlassian only, until you set a password</dd>
            </dl>
            <p class="text-xs text-muted">
              It starts with no teams or projects. The username is final; it
              may get a number added if it is taken in the meantime.
            </p>
            <UButton
              class="w-full justify-center"
              color="primary"
              size="lg"
              label="Create account"
              :loading="linking"
              @click="finishLink('create')"
            />
            <UButton
              class="w-full justify-center"
              color="neutral"
              variant="ghost"
              label="Back"
              :disabled="linking"
              @click="confirmingCreate = false"
            />
          </div>
          <form
            v-else-if="link"
            class="flex flex-col gap-4 bg-muted rounded-[4px] p-6"
            @submit.prevent="finishLink('link')"
          >
            <p class="text-sm">
              <template v-if="linkNeedsUsername">
                {{ link.accounts.length }} accounts use
              </template>
              <template v-else>An account already uses</template>
              <span class="font-medium">{{ link.email }}</span
              >.
              {{
                linkNeedsUsername
                  ? 'Choose the one to link to your Atlassian account, then enter its password.'
                  : 'Enter its password to link it to your Atlassian account.'
              }}
            </p>
            <div
              class="flex flex-col gap-2"
              role="radiogroup"
              aria-label="Account to link"
            >
              <button
                v-for="account in link.accounts"
                :key="account.username"
                type="button"
                role="radio"
                :aria-checked="
                  linkNeedsUsername
                    ? linkUsername === account.username
                    : true
                "
                :disabled="!linkNeedsUsername"
                class="text-left rounded-lg border bg-default px-3 py-2.5 transition-colors"
                :class="
                  !linkNeedsUsername || linkUsername === account.username
                    ? 'border-primary'
                    : 'border-default hover:border-muted'
                "
                @click="linkUsername = account.username"
              >
                <p class="font-medium break-all">{{ account.username }}</p>
                <p class="text-xs text-muted">
                  <template v-if="account.nickname">
                    {{ account.nickname }} ·
                  </template>
                  Created
                  {{ $dayjs(account.createdAt).format('YYYY-MM-DD HH:mm') }}
                </p>
              </button>
            </div>
            <UFormField label="Password">
              <UInput
                v-model="linkPassword"
                class="w-full"
                size="lg"
                autocomplete="current-password"
                :type="showLinkPassword ? 'text' : 'password'"
              >
                <template #trailing>
                  <UButton
                    color="neutral"
                    variant="link"
                    size="sm"
                    :icon="showLinkPassword ? 'i-lucide-eye-off' : 'i-lucide-eye'"
                    @click="showLinkPassword = !showLinkPassword"
                  />
                </template>
              </UInput>
            </UFormField>
            <UButton
              class="w-full justify-center"
              color="primary"
              size="lg"
              type="submit"
              label="Link and sign in"
              :loading="linking"
              :disabled="!linkCanSubmit"
            />
            <UButton
              class="w-full justify-center"
              color="neutral"
              variant="ghost"
              label="This is not my account, create a new one"
              :disabled="linking"
              @click="confirmingCreate = true"
            />
          </form>
          <UForm
            v-else
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
