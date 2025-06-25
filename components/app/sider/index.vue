<script setup lang="ts">
const { loggedIn } = useUserSession()
const { getProjects } = useProjectStore()
const { getUser } = useUserStore()

if (loggedIn.value) {
  await getProjects()
  await getUser()
}
const shelfRef = useTemplateRef('shelf')
const openProjectShelf = () => {
  shelfRef.value?.open()
}
</script>

<template>
  <div class="relative w-[18.75rem] shrink-0 bg-gray-50 shadow">
    <div class="h-full flex flex-col">
      <AppSiderHeader @open-project-shelf="openProjectShelf" />
      <AppSiderBody />
      <AppSiderFooter />
    </div>
    <AppSiderShelf ref="shelf" />
  </div>
</template>
