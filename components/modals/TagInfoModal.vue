<script setup lang="ts">
import type { ITag } from '~/types/interfaces'
import { z } from 'zod/v4'
import {
  DEFAULT_CORNER_RADIUS,
  DEFAULT_LINE_COLOR,
  DEFAULT_LINE_WIDTH,
} from '~/constants'

const props = defineProps<{ tag: ITag }>()
const tag = reactive(props.tag)

const tagStore = useTagStore()

const tabsItems = [
  {
    label: 'Basic',
    desc: '',
    icon: 'i-lucide:info',
    slot: 'basic',
  },
  {
    label: 'Styles',
    desc: '',
    icon: 'i-devicon:styledcomponents',
    slot: 'styles',
  },
  {
    label: 'Translations',
    desc: '',
    icon: 'i-garden:translation-exists-stroke-12',
    slot: 'translations',
  },
]
const emit = defineEmits<{ close: [boolean]; save: [ITag | undefined] }>()

const zEditTag = z.object({
  locked: z.boolean(),
  style: z.object({
    fill: z.string().optional(),
    stroke: z.string().optional(),
    strokeWidth: z.number().optional(),
    cornerRadius: z.number().optional(),
  }),
})

const state = reactive<z.infer<typeof zEditTag>>({
  locked: tag.locked,
  style: {
    fill: tag.style?.fill || '',
    stroke:
      typeof tag.style?.stroke === 'string'
        ? tag.style.stroke
        : DEFAULT_LINE_COLOR,
    strokeWidth: tag.style?.strokeWidth || DEFAULT_LINE_WIDTH,
    cornerRadius: tag.style?.cornerRadius || DEFAULT_CORNER_RADIUS,
  },
})

const isLoading = ref(false)
async function onSubmit() {
  console.log('submit', state)
  isLoading.value = true
  try {
    const updatedTag = await tagStore.updateTag(tag.id, state)
    emit('save', updatedTag)
    emit('close', true)
  } catch (error) {
    console.error(error)
  } finally {
    isLoading.value = false
  }
}

const previewStyle = computed(() => ({
  border: `${state.style.strokeWidth}px solid ${state.style.stroke}`,
  borderRadius: `${state.style.cornerRadius}px`,
}))
</script>

<template>
  <UModal
    class="max-w-[50rem]"
    :close="{ onClick: () => emit('close', false) }"
    title="Tag Info"
  >
    <template #body>
      <UForm class="w-full" :schema="zEditTag" :state="state" @submit="onSubmit">
        <UTabs
          :items="tabsItems"
          variant="link"
          :ui="{ trigger: 'grow', content: 'mt-2' }"
        >
          <template #basic>
            <div class="flex flex-col gap-2.5">
              <div class="w-full flex items-center gap-2.5">
                <UFormField class="flex-1" label="ID">
                  <UInput class="w-full" disabled :model-value="tag.id" />
                </UFormField>
                <UFormField class="flex-1" label="TagID">
                  <UInput class="w-full" disabled :model-value="tag.tagID" />
                </UFormField>
              </div>
              <UFormField
                class="w-full"
                label="Size"
                :ui="{ container: 'grow flex items-center gap-2.5' }"
              >
                <UInput
                  class="grow"
                  disabled
                  :model-value="Math.floor(tag.width)"
                />
                <span class="text-gray-500">x</span>
                <UInput
                  class="grow"
                  disabled
                  :model-value="Math.floor(tag.height)"
                />
              </UFormField>
              <UFormField
                class="w-full"
                label="Position"
                :ui="{ container: 'grow flex items-center gap-2.5' }"
              >
                <UInput
                  class="grow"
                  disabled
                  :model-value="Math.floor(tag.x)"
                />
                <span class="text-gray-500">,</span>
                <UInput
                  class="grow"
                  disabled
                  :model-value="Math.floor(tag.y)"
                />
                <UButton
                  :icon="
                    state.locked
                      ? 'i-lucide:lock-keyhole'
                      : 'lucide:lock-keyhole-open'
                  "
                  size="md"
                  color="primary"
                  variant="outline"
                  @click="state.locked = !state.locked"
                />
              </UFormField>
            </div>
          </template>
          <template #styles>
            <div class="flex flex-col gap-2.5">
              <UFormField label="Fill">
                <div
                  class="w-full flex items-center justify-center h-12 image-container"
                >
                  <div
                    class="w-[50%] h-[calc(100%-0.5rem)] my-auto"
                    :style="previewStyle"
                  ></div>
                </div>
              </UFormField>
              <UFormField label="Stroke Color">
                <LineColorPicker v-model="state.style.stroke" class="mt-2.5" />
              </UFormField>
              <UFormField label="Stroke Width">
                <LineWidthSelect
                  v-model="state.style.strokeWidth"
                  :line-color="state.style.stroke"
                  class="mt-2.5"
                />
              </UFormField>
              <UFormField label="Corner Radius">
                <div class="flex items-center gap-4 mt-4">
                  <USlider
                    v-model="state.style.cornerRadius"
                    class="w-[50%]"
                    :min="0"
                    :max="10"
                    :step="1"
                  />
                  <span>{{ state.style.cornerRadius }} px</span>
                </div>
              </UFormField>
            </div>
          </template>
          <template #translations> </template>
        </UTabs>
        <div class="w-full flex justify-end gap-6 mt-6">
          <UButton
            color="neutral"
            variant="ghost"
            label="Cancel"
            @click="emit('close', false)"
          />
          <UButton
            label="Save"
            type="submit"
          />
        </div>
      </UForm>
    </template>
  </UModal>
</template>

<style lang="css" scoped>
.image-container {
  background: repeating-linear-gradient(
    45deg,
    #f0f0f0,
    #f0f0f0 10px,
    #e0e0e0 10px,
    #e0e0e0 20px
  );
}
</style>
