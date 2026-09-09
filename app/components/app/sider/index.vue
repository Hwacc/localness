<script setup lang="ts">
const { loggedIn } = useUserSession()
const projectStore = useProjectStore()

onMounted(async () => {
  if (loggedIn.value && projectStore.projects.length === 0) {
    await projectStore.getProjects()
  }
})
</script>

<template>
  <div
    class="relative z-10 w-[18.75rem] shrink-0 bg-muted border-r border-default shadow-[4px_0_18px_-4px_rgba(15,23,42,0.18)] dark:shadow-[4px_0_22px_-4px_rgba(0,0,0,0.65)]"
  >
    <div class="h-full flex flex-col">
      <AppSiderHeader />
      <AppSiderBody />
    </div>
  </div>
</template>
