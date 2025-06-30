<script lang="ts" setup>
import { ref, watch, onBeforeUnmount } from 'vue'
import { VueSpinnerRing } from 'vue3-spinners'

const props = withDefaults(
  defineProps<{
    loading?: boolean
    fullscreen?: boolean
  }>(),
  {
    loading: false,
    fullscreen: false,
  }
)

const spinnerRef = ref<HTMLElement | null>(null)
const originalPosition = ref<string | null>(null)
const positionModified = ref(false)

const toggleParentPosition = (show: boolean) => {
  if (!spinnerRef.value?.parentElement) return

  const parent = spinnerRef.value.parentElement

  if (show) {
    // Store original position
    originalPosition.value = window.getComputedStyle(parent).position
    if (originalPosition.value === 'static') {
      parent.style.position = 'relative'
      positionModified.value = true
    }
  } else {
    resetParentPosition()
  }
}

const resetParentPosition = () => {
  if (!positionModified.value || !spinnerRef.value?.parentElement) return

  const parent = spinnerRef.value.parentElement
  parent.style.position = originalPosition.value || ''
  positionModified.value = false
  originalPosition.value = null
}

// Watch loading state
watch(
  () => props.loading,
  (isLoading) => {
    if (!props.fullscreen) {
      toggleParentPosition(isLoading)
    }
  },
  { immediate: true }
)

// Watch fullscreen state
watch(
  () => props.fullscreen,
  () => {
    if (props.loading) {
      toggleParentPosition(!props.fullscreen)
    }
  }
)

// Clean up on unmount
onBeforeUnmount(() => {
  if (!props.fullscreen && props.loading) {
    resetParentPosition()
  }
})
</script>

<template>
  <div
    v-if="loading"
    ref="spinnerRef"
    class="absolute inset-0 flex items-center justify-center bg-white/70 z-50"
    :class="{ 'fixed inset-0 w-screen h-screen bg-white/90': fullscreen }"
  >
    <VueSpinnerRing color="#40D18F" />
  </div>
</template>

