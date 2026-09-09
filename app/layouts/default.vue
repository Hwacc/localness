<script setup lang="ts">
import type { DropdownMenuItem } from '@nuxt/ui'
import TaskProvider from '~/providers/TaskProvider.vue'

const route = useRoute()
const colorMode = useColorMode()
const { loggedIn } = useUserSession()
const projectStore = useProjectStore()

onMounted(async () => {
  if (loggedIn.value) {
    await projectStore.getProjects()
  }
})

const navItems = [
  {
    icon: 'i-lucide:layout-dashboard',
    label: 'Dashboard',
    name: 'dashboard',
    to: '/dashboard',
  },
  {
    icon: 'i-icon-park-twotone:hand-painted-plate',
    label: 'Editor',
    name: 'editor',
    to: '/editor',
  },
  {
    icon: 'i-lucide:languages',
    label: 'Translations',
    name: 'translations',
    to: '/translations',
  },
  {
    icon: 'i-lucide:users',
    label: 'Teams',
    name: 'teams',
    to: '/teams',
  },
]

const themeOptions = [
  { value: 'light', label: 'Light', icon: 'i-lucide:sun' },
  { value: 'dark', label: 'Dark', icon: 'i-lucide:moon' },
  { value: 'system', label: 'System', icon: 'i-lucide:monitor' },
] as const

const themeTriggerIcon = computed(() => {
  const current = themeOptions.find((o) => o.value === colorMode.preference)
  return current?.icon ?? 'i-lucide:moon'
})

const themeMenuItems = computed<DropdownMenuItem[]>(() =>
  themeOptions.map((option) => ({
    label: option.label,
    icon: option.icon,
    type: 'checkbox',
    checked: colorMode.preference === option.value,
    onSelect: (e: Event) => {
      e.preventDefault()
      colorMode.preference = option.value
    },
  }))
)
</script>

<template>
  <div class="h-screen bg-default">
    <TaskProvider>
      <div class="h-full grid grid-cols-[3.125rem_1fr] overflow-y-hidden">
        <div
          class="flex flex-col items-center h-full px-1 py-2 border-r border-default bg-default"
        >
          <div class="flex flex-1 flex-col gap-4 items-center">
            <UTooltip
              v-for="item in navItems"
              :key="item.name"
              :text="item.label"
              :content="{ side: 'right' }"
            >
              <UButton
                :class="[
                  ' hover:text-green-600',
                  route.name === item.name &&
                    'text-green-400 hover:text-green-400',
                ]"
                :icon="item.icon"
                size="md"
                color="neutral"
                variant="ghost"
                @click="navigateTo(item.to)"
              />
            </UTooltip>
          </div>
          <div class="flex flex-col items-center gap-3">
            <ClientOnly>
              <AppWorkspaceSwitcher />
            </ClientOnly>
            <UDropdownMenu
              :items="themeMenuItems"
              :content="{ side: 'right', align: 'end' }"
            >
              <UTooltip text="Theme" :content="{ side: 'right' }">
                <UButton
                  :icon="themeTriggerIcon"
                  size="md"
                  color="neutral"
                  variant="ghost"
                />
              </UTooltip>
            </UDropdownMenu>
            <ClientOnly>
              <AppUserAccount />
            </ClientOnly>
          </div>
        </div>
        <div class="h-full min-w-0 overflow-hidden bg-default">
          <slot />
        </div>
      </div>
    </TaskProvider>
  </div>
</template>
