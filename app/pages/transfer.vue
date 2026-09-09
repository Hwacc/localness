<script setup lang="ts">
definePageMeta({
  middleware: ['protected'],
  layout: 'welcome',
})
const toast = useToast()
const { loggedIn } = useUserSession()
const { getProjects } = useProjectStore()
const { getUser } = useUserStore()

onMounted(async () => {
  if (!loggedIn.value) {
    await navigateTo('/')
    return
  }
  try {
    console.log('initializing...')
    await getUser()
    await getProjects()
    await sleep(3000)
    await navigateTo('/dashboard')
  } catch (error) {
    console.error('initialization error', error)
    toast.add({
      title: 'Error',
      description: 'Failed to initialize',
      color: 'error',
    })
  }
})
</script>

<template>
  <div
    class="flex flex-col items-center mt-[10rem]"
    @click="() => navigateTo('/dashboard')"
  >
    <TextLineShadow class="text-3xl font-bold italic" shadow-color="#40D18F">
      Loading...
    </TextLineShadow>
  </div>
</template>
