<script setup lang="ts">
import { TRANSLATION_LANGUAGES } from '#shared/constants'
import { isEmpty, omit } from 'lodash-es'
import type { ZTagState } from '~/composables/useEditTagState'
import { zTagState } from '~/composables/useEditTagState'
import InputModal from './InputModal.vue'
import { HistoryModal } from '#components'
import type { ITranslationLog } from '~~/shared/types/Translation'

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
    label: 'Prompt',
    desc: '',
    icon: 'i-mage:stars-c',
    slot: 'prompt',
  },
  {
    label: 'Translations',
    desc: '',
    icon: 'i-garden:translation-exists-stroke-12',
    slot: 'translations',
  },
]

const emit = defineEmits<{
  close: [value: boolean]
  save: [
    payload: {
      tag: Omit<ZTagState, 'translation' | 'settings'>
      settings: ZTagSetting
      translation?: ZTranslation
      isTransOriginChanged: boolean
      close: () => void
    }
  ]
  createTrans: [
    payload: {
      type: 'ocr' | 'link' | 'manual'
      translation?: ZTranslation
    }
  ]
  createI18nKey: [
    payload: {
      id: ID
      origin: string
      i18nKey?: string
      prompt?: string
    }
  ]
}>()

const overlay = useOverlay()

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

const selectedFramework = ref<'vue' | 'react'>('vue')
const { state } = useEditTagState(tag)

const editableTranslationContent = computed<string>({
  get(): string {
    return (
      (state.translation?.[selectedFramework.value]?.[
        selectedLanguage.value
      ] as string) || ''
    )
  },
  set(value: string) {
    let temp = state.translation?.[selectedFramework.value]
    if (!temp) {
      temp = {}
    }
    temp[selectedLanguage.value] = value
    if (!state.translation) {
      state.translation = {}
    }
    state.translation[selectedFramework.value] = temp
  },
})

const isTransOriginChanged = ref<boolean>(false)
watch(
  () => state.translation?.origin,
  (val) => {
    if (!val) {
      isTransOriginChanged.value = false
      return
    }
    isTransOriginChanged.value =
      val.trim() !== tag.value.translation?.origin?.trim()
  },
  { deep: true }
)

async function onSubmit() {
  const _trimOrigin = state.translation?.origin?.trim()
  if (isTransOriginChanged.value && _trimOrigin) {
    state.translation.fingerprint = fpTranslation(_trimOrigin)
  }
  try {
    emit('save', {
      tag: omit(state, ['translation', 'settings']),
      settings: state.settings,
      translation: state.translation
        ? {
            id: tag.value.translationID,
            ...state.translation,
            origin: _trimOrigin,
          }
        : undefined,
      isTransOriginChanged: isTransOriginChanged.value,
      close: () => emit('close', true),
    })
  } catch (error) {
    console.error(error)
  }
}

const inputModal = overlay.create(InputModal)
function onCreateTranslation(type: 'ocr' | 'link' | 'manual') {
  if (type === 'manual') {
    const _emit = () => {
      if (!state.translation?.origin) return
      const fingerprint = fpTranslation(state.translation.origin)
      emit('createTrans', {
        type,
        translation: {
          ...state.translation,
          fingerprint,
        },
      })
    }
    if (!state.translation?.origin) {
      inputModal.open({
        title: 'Input Dialog',
        label: 'Enter the original text to create',
        textArea: true,
        onClose: (value) => {
          console.log('on close', value)
          if (value) {
            state.translation.origin = value
            _emit()
          }
        },
      })
    } else {
      _emit()
    }
    return
  }
  emit('createTrans', {
    type,
  })
}

async function onCreateI18nKey() {
  if (!state.translation?.origin) return
  emit('createI18nKey', {
    id: tag.value.id,
    i18nKey: state.i18nKey,
    origin: state.translation?.origin,
    prompt: state.settings.prompt,
  })
}

const transHistoryModal = overlay.create(HistoryModal)
async function onViewTranslationHistory() {
  const history = await useApi<ITranslationLog[]>(
    `/api/translation/${tag.value.translationID}/history`,
    {
      method: 'GET',
    }
  )
  transHistoryModal.open({
    title: 'Translation History',
    history,
  })
}

const previewStyle = computed(() => ({
  border: `${state.settings.style.strokeWidth}px solid ${state.settings.style.stroke}`,
  borderRadius: `${state.settings.style.cornerRadius}px`,
}))

const previewLabelStyle = computed(() => {
  let position: {
    top?: number | string
    right?: number | string
    bottom?: number | string
    left?: number | string
    transform: string
  } = {
    top: 0,
    right: 0,
    transform: 'translateY(-100%)',
  }
  switch (state.settings.labelStyle.align) {
    case 'top-left':
      position = {
        top: '2px',
        left: 0,
        transform: 'translateY(-100%)',
      }
      break
    case 'top-right':
    default:
      break
    case 'bottom-left':
      position = {
        bottom: '-2px',
        left: 0,
        transform: 'translateY(100%)',
      }
      break
    case 'bottom-right':
      position = {
        bottom: '-2px',
        right: 0,
        transform: 'translateY(100%)',
      }
      break
    case 'left':
      position = {
        top: '50%',
        left: '-2px',
        transform: 'translateX(-100%) translateY(-50%)',
      }
      break
    case 'right':
      position = {
        top: '50%',
        right: '-2px',
        transform: 'translateX(100%) translateY(-50%)',
      }
      break
  }
  return {
    color: state.settings.labelStyle.fill,
    fontSize: state.settings.labelStyle.fontSize + 'px',
    fontWeight: state.settings.labelStyle.fontWeight,
    ...position,
  }
})
</script>

<template>
  <UModal
    class="max-w-200"
    title="Tag Info"
    :dismissible="!loading"
    @update:open="(isOpen) => !isOpen && emit('close', false)"
  >
    <template #body>
      <UForm
        class="w-full"
        :schema="zTagState"
        :state="state"
        @submit="onSubmit"
        @error="(e) => console.error('error', e)"
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
                    state.settings.locked
                      ? 'i-lucide:lock-keyhole'
                      : 'i-lucide:lock-keyhole-open'
                  "
                  size="md"
                  color="primary"
                  variant="outline"
                  @click="state.settings.locked = !state.settings.locked"
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
                    class="w-[50%] h-[calc(100%-2rem)] my-auto relative"
                    :style="previewStyle"
                  >
                    <div class="absolute" :style="previewLabelStyle">Label</div>
                  </div>
                </div>
              </UFormField>
              <div class="grid grid-cols-3 gap-4">
                <UFormField label="Stroke Color">
                  <LineColorPicker
                    v-model="state.settings.style.stroke"
                    class="w-full h-8"
                  />
                </UFormField>
                <UFormField label="Stroke Width">
                  <LineWidthSelect
                    v-model="state.settings.style.strokeWidth"
                    class="w-full h-8 line-width-select"
                    :line-color="state.settings.style.stroke"
                  />
                </UFormField>
                <UFormField label="Corner Radius">
                  <div class="flex items-center gap-4 h-8">
                    <USlider
                      v-model="state.settings.style.cornerRadius"
                      class="flex-1"
                      :min="0"
                      :max="10"
                      :step="1"
                    />
                    <span>{{ state.settings.style.cornerRadius }} px</span>
                  </div>
                </UFormField>
                <UFormField label="Text Color">
                  <LineColorPicker
                    v-model="state.settings.labelStyle.fill"
                    class="w-full h-8"
                  />
                </UFormField>
                <UFormField label="Text Weight">
                  <USelect
                    v-model="state.settings.labelStyle.fontWeight"
                    :items="[
                      { label: 'Normal', value: 'normal' },
                      { label: 'Bold', value: 'bold' },
                    ]"
                    class="w-full h-8"
                  />
                </UFormField>
                <UFormField label="Text Size">
                  <div class="flex items-center gap-4 h-8">
                    <USlider
                      v-model="state.settings.labelStyle.fontSize"
                      class="flex-1"
                      :min="12"
                      :max="20"
                      :step="1"
                    />
                    <span>{{ state.settings.labelStyle.fontSize }} px</span>
                  </div>
                </UFormField>
                <UFormField label="Text Align">
                  <USelect
                    v-model="state.settings.labelStyle.align"
                    :items="[
                      { label: 'Top-Left', value: 'top-left' },
                      { label: 'Top-Right', value: 'top-right' },
                      { label: 'Bottom-Left', value: 'bottom-left' },
                      { label: 'Bottom-Right', value: 'bottom-right' },
                      { label: 'Left', value: 'left' },
                      { label: 'Right', value: 'right' },
                    ]"
                    class="w-full h-8"
                  />
                </UFormField>
              </div>
            </div>
          </template>
          <template #prompt>
            <MarkdownPrompt v-model="state.settings.prompt" />
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
              <div class="flex gap-4">
                <UButton
                  color="neutral"
                  variant="soft"
                  icon="i-lucide:a-large-small"
                  :disabled="loading"
                  @click="onCreateTranslation('manual')"
                >
                  Create New
                </UButton>
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
            </div>
            <div v-else class="flex flex-col gap-2.5">
              <UFormField label="I18n Key">
                <div class="w-full flex items-center gap-2.5">
                  <UInput v-model="state.i18nKey" class="w-full" />
                  <AIButton @click="onCreateI18nKey" />
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
                    <UButton
                      label="History"
                      icon="i-lucide:history"
                      size="xs"
                      color="secondary"
                      variant="outline"
                      @click="onViewTranslationHistory"
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
              <UFormField label="Translations" :ui="{ label: 'w-full' }">
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
                    <FrameworkGroup
                      v-model="selectedFramework"
                      class="ml-auto mr-0"
                      size="sm"
                    />
                  </div>
                </template>
                <template #default>
                  <UTextarea
                    v-model="editableTranslationContent"
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
            icon="i-lucide-save"
            :loading="loading"
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
