<script setup lang="ts">
import lottie, { type AnimationItem } from 'lottie-web'

definePageMeta({
  middleware: ['protected'],
})

const animationContainer = useTemplateRef<HTMLDivElement>('container')
const animation = ref<AnimationItem>()

onMounted(() => {
  if (!animationContainer.value) return
  animation.value = lottie.loadAnimation({
    container: animationContainer.value,
    renderer: 'svg',
    loop: true,
    autoplay: true,
    path: '/lottie/building.json',
  })
})

onUnmounted(() => {
  if (!animation.value) return
  animation.value.destroy()
})
</script>

<template>
  <div class="size-full flex flex-col justify-center items-center gap-3">
    <div ref="container" class="size-50" />
    <TextLineShadow class="text-3xl font-bold italic" shadow-color="#40D18F">
      Building...
    </TextLineShadow>
  </div>
</template>
