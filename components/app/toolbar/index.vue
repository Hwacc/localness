<script setup lang="ts">
import { injectEditorContext } from '~/providers/EditorProvider.vue'
import { SCALE_OPTIONS } from '~/constants'
import type { EditorMode } from '~/core/Editor'

const { editor, ready, scale, mode, lineWidth, lineColor } =
  injectEditorContext()

// scale
const scaleText = computed(() => `${Math.trunc(scale.value * 100)}%`)
function onScaleChange(type: 'plus' | 'minus' | 'set', s?: number) {
  const _scale = Math.trunc(scale.value * 10) / 10
  if (type === 'plus') {
    editor.value?.setScale(_scale + 0.1)
  } else if (type === 'minus') {
    editor.value?.setScale(_scale - 0.1)
  } else {
    editor.value?.setScale(s ?? 1)
  }
}

// mode
function onModeChange(m: EditorMode) {
  editor.value?.setMode(m)
}

// line width
function onLineChange(l: number) {
  lineWidth.value = l
  editor.value?.setLineWidth(l)
}

// line color
function onLineColorChange(c: string | undefined) {
  lineColor.value = c ?? '#000000'
  // editor.value?.setLineColor(c)
}
</script>

<template>
  <div class="flex flex-col bg-gray-50">
    <!-- Top Navigation -->
    <div class="flex items-center justify-center py-4 bg-white shadow">
      <div class="flex items-center gap-4">
        <div class="flex items-center gap-2">
          <UTooltip text="Zoom Out">
            <UButton
              icon="i-lucide:minus"
              size="md"
              color="neutral"
              variant="outline"
              :disabled="!ready || scale <= 0.1"
              @click="() => onScaleChange('minus')"
            />
          </UTooltip>
          <USelect
            class="w-30"
            :model-value="scale"
            :items="SCALE_OPTIONS"
            size="md"
            :disabled="!ready"
            @update:model-value="(s: number) => onScaleChange('set', s)"
          >
            <template #default>
              <div>{{ scaleText }}</div>
            </template>
          </USelect>
          <UTooltip text="Zoom In">
            <UButton
              icon="i-lucide:plus"
              size="md"
              color="neutral"
              variant="outline"
              :disabled="!ready || scale > 3"
              @click="() => onScaleChange('plus')"
            />
          </UTooltip>
        </div>
        <UTooltip text="Drag">
          <UButton
            :class="[mode === 'drag' && 'bg-green-400 text-white']"
            icon="i-lucide:hand"
            size="md"
            color="neutral"
            variant="outline"
            :disabled="!ready || scale > 3"
            @click="() => onModeChange('drag')"
          />
        </UTooltip>
        <UTooltip text="Add Tag">
          <UButton
            :class="[mode === 'draw' && 'bg-green-400 text-white']"
            icon="i-lucide:pencil-ruler"
            size="md"
            color="neutral"
            variant="outline"
            :disabled="!ready"
            @click="() => onModeChange('draw')"
          />
        </UTooltip>
        <UTooltip text="Edit Tags">
          <UButton
            :class="[mode === 'edit' && 'bg-green-400 text-white']"
            icon="i-lucide:square-pen"
            size="md"
            color="neutral"
            variant="outline"
            :disabled="!ready"
            @click="() => onModeChange('edit')"
          />
        </UTooltip>
        <LineWidthSelect
          :model-value="lineWidth"
          :line-color="lineColor"
          @update:model-value="onLineChange"
        />
        <LineColorPicker
          variant="mini"
          :model-value="lineColor"
          @update:model-value="onLineColorChange"
        />
      </div>
    </div>
  </div>
</template>
