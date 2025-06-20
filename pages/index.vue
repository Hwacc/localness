<script setup lang="ts">
import { WELCOME_TEXTS } from '~/constants'
import { z } from 'zod/v4'
import { useStorage } from '@vueuse/core'
import { AnimatePresence, motion } from 'motion-v'

definePageMeta({
  middleware: ['authenticate'],
})

const authStore = useAuthStore()

const startFlag = useStorage('get-start', false)
function onStart() {
  startFlag.value = true
}

const showPassword = ref(false)
const loginSchema = z.object({
  username: z.string().min(3),
  password: z.string().min(3),
})
type LoginSchema = z.output<typeof loginSchema>
const state = reactive<LoginSchema>({ username: '', password: '' })

async function onSubmit() {
  console.log('submit', state)
  await authStore.login(state.username, state.password)
}
</script>

<template>
  <div class="relative size-full flex flex-col items-center justify-center">
    <AuroraBackground class="absolute inset-0 z-[-1]" />
    <MorphingText :texts="WELCOME_TEXTS" />
    <ClientOnly>
      <div class="flex flex-col items-center mt-[10rem]">
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
            <RainbowComponent class="text-white rounded-[4px]" @click="onStart">
              Get Start
            </RainbowComponent>
          </motion.div>
          <motion.div
            v-else
            key="login"
            class="relative w-[400px]"
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
              class="flex flex-col gap-6 bg-gray-50 rounded-[4px] p-6"
              :schema="loginSchema"
              :state="state"
              @submit="onSubmit"
            >
              <UFormField label="Username">
                <UInput v-model="state.username" class="w-full" size="lg" />
              </UFormField>
              <UFormField label="Password">
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
                color="neutral"
                size="lg"
                label="Login"
                type="submit"
              />
            </UForm>
          </motion.div>
        </AnimatePresence>
      </div>
    </ClientOnly>
  </div>
</template>
