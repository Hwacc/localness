<script setup lang="ts">
const projectStore = useProjectStore()
const { getProjects } = projectStore
const userStore = useUserStore()

await getProjects()
await userStore.getUser()

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
