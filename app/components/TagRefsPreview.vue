<script setup lang="ts">
import { useResizeObserver } from '@vueuse/core'
import { DEFAULT_LINE_COLOR, DEFAULT_LINE_WIDTH } from '#shared/constants'

const props = defineProps<{
  image: string | null
  tags: II18nKeyRefTag[]
}>()

const imgRef = useTemplateRef<HTMLImageElement>('previewImg')
const natural = ref({ width: 0, height: 0 })
const display = ref({ width: 0, height: 0 })

const scale = computed(() => {
  if (!natural.value.width || !display.value.width) return 0
  return display.value.width / natural.value.width
})

function measure() {
  const el = imgRef.value
  if (!el) return
  natural.value = {
    width: el.naturalWidth,
    height: el.naturalHeight,
  }
  display.value = {
    width: el.clientWidth,
    height: el.clientHeight,
  }
}

const boxes = computed(() => {
  const s = scale.value
  if (!s) return []
  return props.tags.map((tag) => {
    const stroke =
      typeof tag.settings?.style?.stroke === 'string'
        ? tag.settings.style.stroke
        : DEFAULT_LINE_COLOR
    const strokeWidth = tag.settings?.style?.strokeWidth ?? DEFAULT_LINE_WIDTH
    return {
      id: tag.id,
      left: tag.x * s,
      top: tag.y * s,
      width: tag.width * s,
      height: tag.height * s,
      stroke,
      strokeWidth,
    }
  })
})

useResizeObserver(imgRef, measure)
</script>

<template>
  <div
    v-if="image"
    class="relative inline-block max-w-full max-h-full leading-none"
  >
    <img
      ref="previewImg"
      v-oss-image="image"
      class="max-w-full max-h-[70vh] object-contain"
      @load="measure"
    />
    <div
      v-for="box in boxes"
      :key="box.id"
      class="absolute pointer-events-none"
      :style="{
        left: `${box.left}px`,
        top: `${box.top}px`,
        width: `${box.width}px`,
        height: `${box.height}px`,
        border: `${box.strokeWidth}px solid ${box.stroke}`,
        boxShadow: '0 0 0 1px var(--ui-primary)',
      }"
    />
  </div>
  <p v-else class="text-sm text-muted">This page has no screenshot.</p>
</template>
