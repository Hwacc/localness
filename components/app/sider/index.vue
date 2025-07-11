<script setup lang="ts">
import { ProjectSelectSlideover } from '#components'

const { loggedIn } = useUserSession()
const { getProjects } = useProjectStore()
const { getUser } = useUserStore()

if (loggedIn.value) {
  await getProjects()
  await getUser()
}

const openProjectSlideover = ref(false)
const onOpenProjectSlideover = () => {
  openProjectSlideover.value = true
}
</script>

<template>
  <div class="relative w-[18.75rem] shrink-0 bg-gray-50 shadow">
    <div class="h-full flex flex-col">
      <AppSiderHeader @open-project-shelf="onOpenProjectSlideover" />
      <AppSiderBody />
      <AppSiderFooter />
    </div>
    <ProjectSelectSlideover v-model="openProjectSlideover" />
  </div>
</template>
