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
import type { ITranslation } from '~/types/Translation'

const {
  tag,
  clip,
  loading = false,
} = defineProps<{
  tag: ITag
  clip: string
  loading?: boolean
}>()
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
const emit = defineEmits<{
  close: [boolean]
  creatTrans: [type: 'ocr' | 'bind']
  save: [
    tag: ITag | undefined,
    translation: ZTranslation | undefined,
    close: () => void
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
  i18nKey: tag.i18nKey || '',
  translation: tag.translation || ({} as ITranslation),
})
watch(
  () => tag,
  (val) => {
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
    state.i18nKey = val.i18nKey
    state.translation = val.translation || ({} as ITranslation)
  }
)

async function onSubmit() {
  const preTag = omit(state, ['translation'])
  const preTranslation = state.translation
  try {
    const updatedTag = await tagStore.updateTag(tag.id, preTag)
    emit('save', updatedTag, preTranslation, () => emit('close', true))
  } catch (error) {
    console.error(error)
  }
}

function createTranslation(type: 'ocr' | 'bind') {
  emit('creatTrans', type)
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
    :dismissible="!loading"
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
                @click="createTranslation('bind')"
              >
                Bind a existing translation
              </UButton>
              <span>OR</span>
              <UButton
                color="primary"
                variant="solid"
                @click="createTranslation('ocr')"
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
              <UFormField label="Text">
                <template #label="{ label }">
                  <div class="flex items-center gap-3">
                    <span>{{ label }}</span>
                    <span class="text-xs text-gray-500">
                      MD5: {{ tag.translation?.md5 }}
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
          <UButton label="Save" type="submit" :loading="loading" />
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
