<script setup lang="ts">
import type { ITag } from '~/types/interfaces'

const props = defineProps<{ tag: ITag }>()
const tag = reactive(props.tag)

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

const emit = defineEmits<{ close: [boolean]; save: [ITag] }>()
</script>

<template>
  <UModal
    class="max-w-[50rem]"
    :close="{ onClick: () => emit('close', false) }"
    title="Tag Info"
  >
    <template #body>
      <div class="w-full">
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
                    tag.locked
                      ? 'i-lucide:lock-keyhole'
                      : 'lucide:lock-keyhole-open'
                  "
                  size="md"
                  color="primary"
                  variant="outline"
                />
              </UFormField>
            </div>
          </template>
          <template #styles>
            <div class="flex flex-col gap-2.5">
              <UFormField label="Fill">
                <div class="w-full h-7.5 image-container"></div>
              </UFormField>
              <UFormField label="Stroke">
                <div class="w-full h-7.5 image-container">
                  <div class="size-full bg-no-repeat bg-size-[100%_100%]">
                    {{ tag.style.stroke }}
                  </div>
                </div>
              </UFormField>
              <UFormField label="Stroke Width">
                <LineWidthSelect
                  class="mt-2.5"
                  :model-value="tag.style.strokeWidth"
                />
              </UFormField>
              <UFormField label="Corner Radius">
                <div class="flex items-center gap-4 mt-4">
                  <USlider
                    class="w-[50%]"
                    :model-value="tag.style.cornerRadius"
                    :min="0"
                    :max="10"
                    :step="1"
                  />
                  <span>{{ tag.style.cornerRadius }} px</span>
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
            @click="
              () => {
                emit('save', tag)
                emit('close', true)
              }
            "
          />
        </div>
      </div>
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
