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
    :title="`Tag Info - ${tag.id}`"
  >
    <template #body>
      <div class="w-full">
        <UTabs :items="tabsItems" variant="link" :ui="{ trigger: 'grow' }">
          <template #basic> </template>
          <template #styles> </template>
          <template #translations> </template>
        </UTabs>
      </div>
      <div class="flex flex-col gap-2.5">
        <UFormField label="ID">
          <UInput class="w-full" readonly :model-value="tag.id" />
        </UFormField>
        <div class="w-full flex items-center gap-2.5">
          <UFormField class="flex-1" label="X">
            <UInput class="w-full" readonly :model-value="tag.x" />
          </UFormField>
          <UFormField class="flex-1" label="Y">
            <UInput class="w-full" readonly :model-value="tag.y" />
          </UFormField>
        </div>
        <div class="w-full flex items-center gap-2.5">
          <UFormField class="flex-1" label="Width">
            <UInput class="w-full" readonly :model-value="tag.width" />
          </UFormField>
          <UFormField class="flex-1" label="Height">
            <UInput class="w-full" readonly :model-value="tag.height" />
          </UFormField>
        </div>
        <UFormField label="Key">
          <UInput v-model="tag.i18nKey" class="w-full" />
        </UFormField>
      </div>
    </template>
    <template #footer>
      <div class="w-full flex justify-end gap-6">
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
    </template>
  </UModal>
</template>
