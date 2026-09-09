<script setup lang="ts">
import TaskProvider from '~/providers/TaskProvider.vue'

const route = useRoute()
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
    icon: 'i-lucide:git-branch',
    label: 'Git',
    name: 'git',
    to: '/git',
  },
  {
    icon: 'i-lucide:users',
    label: 'Teams',
    name: 'teams',
    to: '/teams',
  },
]
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
              <AppUserAccount />
            </ClientOnly>
            <AppSettingsDrawer />
          </div>
        </div>
        <div class="h-full min-w-0 overflow-hidden bg-default flex flex-col">
          <AppWorkspaceBar v-if="route.name !== 'dashboard'" />
          <div class="flex-1 min-h-0 min-w-0 overflow-hidden">
            <slot />
          </div>
        </div>
      </div>
    </TaskProvider>
  </div>
</template>
