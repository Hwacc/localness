<script setup lang="ts">
import { ProjectSelectSlideover } from '#components'

const { loggedIn } = useUserSession()
const { getProjects } = useProjectStore()

if (loggedIn.value) {
  await getProjects()
}

const openProjectSlideover = ref(false)
const onOpenProjectSlideover = () => {
  openProjectSlideover.value = true
}
</script>

<template>
  <div
    class="relative z-10 w-[18.75rem] shrink-0 bg-muted border-r border-default shadow-[4px_0_18px_-4px_rgba(15,23,42,0.18)] dark:shadow-[4px_0_22px_-4px_rgba(0,0,0,0.65)]"
  >
    <div class="h-full flex flex-col">
      <AppSiderHeader @open-project-shelf="onOpenProjectSlideover" />
      <AppSiderBody />
    </div>
    <ProjectSelectSlideover v-model="openProjectSlideover" />
  </div>
</template>
