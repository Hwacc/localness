<script setup lang="ts">
import TaskProvider from '~/providers/TaskProvider.vue'

const route = useRoute()
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
]

</script>

<template>
  <div class="h-screen">
    <TaskProvider>
      <div class="h-full grid grid-cols-[3.125rem_1fr] overflow-y-hidden">
        <div
          class="flex flex-col gap-4 items-center h-full px-1 py-2 border-r-1 border-gray-50"
        >
          <UButton
            v-for="item in navItems"
            :key="item.name"
            :class="[
              ' hover:text-green-600',
              route.name === item.name && 'text-green-400 hover:text-green-400',
            ]"
            :icon="item.icon"
            size="md"
            color="neutral"
            variant="ghost"
            @click="navigateTo(item.to)"
          />
        </div>
        <div class="h-full">
          <slot />
        </div>
      </div>
    </TaskProvider>
  </div>
</template>
