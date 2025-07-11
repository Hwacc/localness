<script setup lang="ts">
import type { ITag } from '~/types/Tag'
import { z } from 'zod/v4'
import {
  DEFAULT_CORNER_RADIUS,
  DEFAULT_LINE_COLOR,
  DEFAULT_LINE_WIDTH,
  TRANSLATION_LANGUAGES,
} from '~/constants'
import { isEmpty, omit } from 'lodash-es'

const props = defineProps<{
  tag: ITag
  clip: string
  loading?: boolean
}>()
const { tag, clip, loading } = toRefs(props)

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

const emit = defineEmits<{
  close: [boolean]
  createTrans: [type: 'ocr' | 'link' | 'manual', translation?: ZTranslation]
  save: [
    {
      tag: Omit<ZEditTag, 'translation'>
      translation: ZTranslation | undefined
      isTransOriginChanged: boolean
      close: () => void
    }
  ]
}>()

const selectedLanguage = ref<string>('en')
const selectedItem = computed(() => {
  const language = TRANSLATION_LANGUAGES.find(
    (o: any) => o.value === selectedLanguage.value
  )
  return {
    icon: language?.icon || 'i-lucide:languages',
    label: language?.label || 'Unknown',
  }
})

const zEditTag = z.object({
  locked: z.boolean(),
  style: z.object({
    fill: z.string().optional(),
    stroke: z.string().optional(),
    strokeWidth: z.number().optional(),
    cornerRadius: z.number().optional(),
  }),
  i18nKey: z.string().optional(),
  translation: zTranslation,
})
type ZEditTag = z.infer<typeof zEditTag>

const state = reactive<ZEditTag>({
  locked: tag.value.locked,
  style: {
    fill: tag.value.style?.fill || '',
    stroke:
      typeof tag.value.style?.stroke === 'string'
        ? tag.value.style.stroke
        : DEFAULT_LINE_COLOR,
    strokeWidth: tag.value.style?.strokeWidth || DEFAULT_LINE_WIDTH,
    cornerRadius: tag.value.style?.cornerRadius || DEFAULT_CORNER_RADIUS,
  },
  i18nKey: tag.value.i18nKey || '',
  translation: { ...(tag.value.translation || {}) },
})
watch(tag, (val) => {
  state.locked = val.locked
  state.style = {
    fill: val.style?.fill || '',
    stroke:
      typeof val.style?.stroke === 'string'
        ? val.style.stroke
        : DEFAULT_LINE_COLOR,
    strokeWidth: val.style?.strokeWidth || DEFAULT_LINE_WIDTH,
    cornerRadius: val.style?.cornerRadius || DEFAULT_CORNER_RADIUS,
  }
  state.i18nKey = val.i18nKey || ''
  state.translation = { ...(val.translation || {}) }
})

const isTransOriginChanged = ref<boolean>(false)
watch(
  () => state.translation.origin,
  (val) => {
    if (!val) {
      isTransOriginChanged.value = false
      return
    }
    isTransOriginChanged.value = val !== tag.value.translation?.origin
  },
  { deep: true }
)

async function onSubmit() {
  const preTag = omit(state, ['translation'])
  let preTranslation = state.translation
  try {
    if (isTransOriginChanged.value && preTranslation.origin) {
      const fingerprint = fpTranslation(preTranslation.origin)
      preTranslation = { ...preTranslation, fingerprint }
    }
    emit('save', {
      tag: preTag,
      translation: preTranslation,
      isTransOriginChanged: isTransOriginChanged.value,
      close: () => emit('close', true),
    })
  } catch (error) {
    console.error(error)
  }
}

function onCreateTranslation(type: 'ocr' | 'link' | 'manual') {
  if (type === 'manual') {
    if (!state.translation.origin) return
    const fingerprint = fpTranslation(state.translation.origin)
    emit('createTrans', type, {
      ...state.translation,
      fingerprint,
    })
    return
  }
  emit('createTrans', type)
}

const previewStyle = computed(() => ({
  border: `${state.style.strokeWidth}px solid ${state.style.stroke}`,
  borderRadius: `${state.style.cornerRadius}px`,
}))
</script>

<template>
  <UModal
    class="max-w-[50rem]"
    title="Tag Info"
    :dismissible="!loading"
    @update:open="(isOpen) => !isOpen && emit('close', false)"
  >
    <template #body>
      <UForm
        class="w-full"
        :schema="zEditTag"
        :state="state"
        @submit="onSubmit"
      >
        <UTabs
          :items="tabsItems"
          variant="link"
          :ui="{ trigger: 'grow', content: 'mt-2' }"
        >
          <template #basic>
            <div class="flex flex-col gap-2.5">
              <UFormField label="Tag Clip">
                <img
                  class="w-full h-25 object-center object-scale-down"
                  :src="clip"
                />
              </UFormField>
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
                      : 'i-lucide:lock-keyhole-open'
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
            <div class="flex flex-col gap-4">
              <UFormField label="Preview">
                <div
                  class="w-full flex items-center justify-center h-16 image-container"
                >
                  <div
                    class="w-[50%] h-[calc(100%-2rem)] my-auto"
                    :style="previewStyle"
                  ></div>
                </div>
              </UFormField>
              <div class="grid grid-cols-3 grid-rows-1 gap-4">
                <UFormField label="Stroke Color">
                  <LineColorPicker
                    v-model="state.style.stroke"
                    class="w-full h-8"
                  />
                </UFormField>
                <UFormField label="Stroke Width">
                  <LineWidthSelect
                    v-model="state.style.strokeWidth"
                    class="w-full h-8 line-width-select"
                    :line-color="state.style.stroke"
                  />
                </UFormField>
                <UFormField label="Corner Radius">
                  <div class="flex items-center gap-4 h-8">
                    <USlider
                      v-model="state.style.cornerRadius"
                      class="flex-1"
                      :min="0"
                      :max="10"
                      :step="1"
                    />
                    <span>{{ state.style.cornerRadius }} px</span>
                  </div>
                </UFormField>
              </div>
            </div>
          </template>
          <template #translations>
            <div
              v-if="isEmpty(state.translation)"
              class="flex flex-col items-center justify-center min-h-50 gap-4"
            >
              <UIcon name="mingcute:empty-box-line" size="4rem" />
              <p class="text-gray-500">Not have translation yet</p>
              <UButton
                color="neutral"
                variant="soft"
                icon="i-lucide-link"
                :disabled="loading"
                @click="onCreateTranslation('link')"
              >
                Link a existing translation
              </UButton>
              <span>OR</span>
              <UButton
                color="primary"
                variant="solid"
                icon="i-mdi:ocr"
                :disabled="loading"
                @click="onCreateTranslation('ocr')"
              >
                Create with OCR
              </UButton>
            </div>
            <div v-else class="flex flex-col gap-2.5">
              <UFormField label="I18n Key">
                <div class="w-full flex items-center gap-2.5">
                  <UInput v-model="state.i18nKey" class="w-full" />
                  <AIButton />
                </div>
              </UFormField>
              <UFormField label="Text" :ui="{ label: 'w-full' }">
                <template #label="{ label }">
                  <div class="flex items-center gap-3">
                    <span>{{ label }}</span>
                    <UButton
                      label="Link"
                      icon="i-lucide-link"
                      size="xs"
                      variant="outline"
                      @click="onCreateTranslation('link')"
                    />
                    <UButton
                      v-if="isTransOriginChanged"
                      label="New"
                      color="neutral"
                      size="xs"
                      variant="outline"
                      icon="i-lucide:copy-plus"
                      @click="onCreateTranslation('manual')"
                    />
                    <span class="mr-0 ml-auto text-xs text-gray-500">
                      Finger: {{ tag.translation?.fingerprint }}
                    </span>
                  </div>
                </template>
                <template #default>
                  <UTextarea
                    v-model="state.translation.origin"
                    class="w-full"
                    :maxrows="4"
                    autoresize
                  />
                </template>
              </UFormField>
              <UFormField label="Translations">
                <template #label="{ label }">
                  <div class="flex items-center gap-3">
                    <span>{{ label }}</span>
                    <USelect
                      v-model="selectedLanguage"
                      :items="TRANSLATION_LANGUAGES"
                      size="sm"
                      class="min-w-50"
                    >
                      <template #default>
                        <div class="flex items-center gap-2">
                          <UIcon :name="selectedItem.icon" :size="12" />
                          <span>{{ selectedItem.label }}</span>
                        </div>
                      </template>
                    </USelect>
                    <AIButton class="[&>span]:h-6 [&>span]:leading-1" />
                  </div>
                </template>
                <template #default>
                  <UTextarea
                    v-model="state.translation[selectedLanguage] as string"
                    class="w-full"
                    :maxrows="4"
                    autoresize
                  />
                </template>
              </UFormField>
            </div>
          </template>
        </UTabs>
        <div class="w-full flex justify-end gap-6 mt-6">
          <UButton
            color="neutral"
            variant="ghost"
            label="Cancel"
            :disabled="loading"
            @click="emit('close', false)"
          />
          <UButton
            label="Save"
            type="submit"
            :loading="loading"
            icon="i-lucide-save"
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

:deep(.line-width-select) {
  & :deep(.line-wrap) {
    width: 100%;
  }
  & :deep(.line) {
    flex: 1;
    width: 100%;
  }
}
</style>
