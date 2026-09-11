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
  <div class="size-full overflow-auto flex items-center justify-center p-6">
    <div class="flex flex-col items-center gap-4 text-center">
      <div class="flex items-center gap-6">
        <!-- Lottie injects an svg sized to this box, so the box is fixed and
             the svg is forced to fit it. -->
        <div
          ref="container"
          class="size-40 shrink-0 overflow-hidden [&>svg]:size-full"
        />
        <UIcon name="i-lucide:plug-zap" class="size-6 text-muted shrink-0" />
        <div class="shrink-0 flex flex-col items-center justify-center gap-2 size-40">
          <UIcon
            name="i-simple-icons:deepseek"
            class="size-14"
            style="color: #4d6bfe"
          />
          <span class="text-sm font-medium">DeepSeek</span>
        </div>
      </div>
      <TextLineShadow class="text-3xl font-bold italic" shadow-color="#40D18F">
        Building...
      </TextLineShadow>
      <p class="text-sm text-muted">
        Getting ready to plug in the DeepSeek Harness SDK.
      </p>
    </div>
  </div>
</template>
