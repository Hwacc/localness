<script setup lang="ts">
/**
 * A read-only screenshot with its tag boxes, zoomed to fit the boxes (Focus)
 * or the whole image (Fit). Used by the Resolve and Tags drawers.
 */
import { useResizeObserver } from '@vueuse/core'
import { DEFAULT_LINE_COLOR, DEFAULT_LINE_WIDTH } from '#shared/constants'

const props = defineProps<{
  image: string | null
  tags: II18nKeyRefTag[]
  /** Tags to frame in focus mode; empty frames every tag. */
  focusIds?: II18nKeyRefTag['id'][]
}>()

const MAX_ZOOM = 2.5
const MIN_PAD = 48
const PAD_RATIO = 0.25

const mode = ref<'focus' | 'fit'>('focus')

watch(
  () => props.focusIds?.join(','),
  () => {
    mode.value = 'focus'
  }
)

const viewportRef = useTemplateRef<HTMLDivElement>('viewport')
const viewport = ref({ width: 0, height: 0 })
const natural = ref({ width: 0, height: 0 })

useResizeObserver(viewportRef, ([entry]) => {
  if (!entry) return
  viewport.value = {
    width: entry.contentRect.width,
    height: entry.contentRect.height,
  }
})

function onLoad(event: Event) {
  const img = event.target as HTMLImageElement
  natural.value = { width: img.naturalWidth, height: img.naturalHeight }
}

const framed = computed(() => {
  const ids = props.focusIds ?? []
  const picked = ids.length
    ? props.tags.filter((tag) => ids.includes(tag.id))
    : props.tags
  return picked.length ? picked : props.tags
})

/** Region of the screenshot (natural px) the viewport should show. */
const region = computed(() => {
  const { width: W, height: H } = natural.value
  const whole = { x: 0, y: 0, width: W, height: H }
  if (mode.value === 'fit' || !framed.value.length) return whole
  const left = Math.min(...framed.value.map((t) => t.x))
  const top = Math.min(...framed.value.map((t) => t.y))
  const right = Math.max(...framed.value.map((t) => t.x + t.width))
  const bottom = Math.max(...framed.value.map((t) => t.y + t.height))
  const pad = Math.max(MIN_PAD, Math.max(right - left, bottom - top) * PAD_RATIO)
  const x = Math.max(0, left - pad)
  const y = Math.max(0, top - pad)
  return {
    x,
    y,
    width: Math.min(W, right + pad) - x,
    height: Math.min(H, bottom + pad) - y,
  }
})

function place(view: number, size: number, start: number, length: number, s: number) {
  if (size * s <= view) return (view - size * s) / 2
  const centered = view / 2 - (start + length / 2) * s
  return Math.min(0, Math.max(view - size * s, centered))
}

const transform = computed(() => {
  const { width: W, height: H } = natural.value
  const { width: vw, height: vh } = viewport.value
  const r = region.value
  if (!W || !H || !vw || !vh || !r.width || !r.height) return null
  const fitAll = Math.min(vw / W, vh / H)
  const s = Math.max(
    fitAll,
    Math.min(vw / r.width, vh / r.height, Math.max(MAX_ZOOM, fitAll))
  )
  return {
    s,
    x: place(vw, W, r.x, r.width, s),
    y: place(vh, H, r.y, r.height, s),
  }
})

const zoomPercent = computed(() =>
  transform.value ? Math.round(transform.value.s * 100) : 0
)

const boxes = computed(() => {
  const s = transform.value?.s
  if (!s) return []
  return props.tags.map((tag) => {
    const stroke =
      typeof tag.settings?.style?.stroke === 'string'
        ? tag.settings.style.stroke
        : DEFAULT_LINE_COLOR
    const strokeWidth = tag.settings?.style?.strokeWidth ?? DEFAULT_LINE_WIDTH
    return {
      id: tag.id,
      left: tag.x,
      top: tag.y,
      width: tag.width,
      height: tag.height,
      border: `${strokeWidth / s}px solid ${stroke}`,
    }
  })
})
</script>

<template>
  <div ref="viewport" class="relative size-full overflow-hidden">
    <template v-if="image">
      <div
        class="absolute left-0 top-0 origin-top-left transition-transform duration-200 ease-out"
        :class="transform ? 'opacity-100' : 'opacity-0'"
        :style="{
          width: `${natural.width}px`,
          height: `${natural.height}px`,
          transform: transform
            ? `translate(${transform.x}px, ${transform.y}px) scale(${transform.s})`
            : undefined,
        }"
      >
        <img
          v-oss-image="image"
          class="block size-full max-w-none select-none"
          draggable="false"
          @load="onLoad"
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
            border: box.border,
          }"
        />
      </div>
      <div
        class="absolute top-2 right-2 flex items-center gap-1 rounded-md bg-default/80 backdrop-blur p-0.5 ring ring-default"
      >
        <span class="px-1.5 text-xs text-muted tabular-nums">{{ zoomPercent }}%</span>
        <UTooltip text="Zoom to the boxes">
          <UButton
            size="xs"
            icon="i-lucide:scan-search"
            aria-label="Focus"
            :color="mode === 'focus' ? 'primary' : 'neutral'"
            :variant="mode === 'focus' ? 'soft' : 'ghost'"
            @click="mode = 'focus'"
          />
        </UTooltip>
        <UTooltip text="Whole screenshot">
          <UButton
            size="xs"
            icon="i-lucide:maximize"
            aria-label="Fit"
            :color="mode === 'fit' ? 'primary' : 'neutral'"
            :variant="mode === 'fit' ? 'soft' : 'ghost'"
            @click="mode = 'fit'"
          />
        </UTooltip>
      </div>
    </template>
    <p v-else class="p-3 text-sm text-muted">This page has no screenshot.</p>
  </div>
</template>
