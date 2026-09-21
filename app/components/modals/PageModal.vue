<script setup lang="ts">
import type { FormSubmitEvent } from '@nuxt/ui'
import type { ImageUploader } from '#components'
import { omit } from 'lodash-es'
import {
  DEFAULT_KEY_CONVENTION,
  KEY_STYLES,
} from '#shared/utils/key-convention'

type Mode = 'edit' | 'create' | 'view'
const {
  mode,
  file = undefined,
  page = new Page(''),
} = defineProps<{
  mode: Mode
  file?: File
  page?: IPage
}>()

const emit = defineEmits<{
  close: [boolean]
  save: [Pick<IPage, 'name' | 'image' | 'settings'>, { close: () => void }]
  delete: []
}>()

const toast = useToast()

const previewUrl = computed(() => {
  if (page.image) return page.image
  if (file) return URL.createObjectURL(file)
  return ''
})

const projectStore = useProjectStore()

/** A page created while one release is being viewed starts on that release. */
const defaultReleaseId = defaultReleaseIdForFilter(projectStore.curReleaseFilter)

/*
 * Deliberately not typed `ZPage`: the four convention fields are nullable in
 * the API and the schema, but the form holds concrete values. Whether a value
 * is written at all is the switch's decision at submit time, so keeping nulls
 * out of the fields is what lets them bind straight to the inputs.
 */
const state = reactive({
  name: page.name,
  image: page.image,
  settings: {
    ocrLanguage:
      page.settings?.ocrLanguage ??
      projectStore.curProject?.settings?.ocrLanguage ??
      'eng',
    ocrEngine:
      page.settings?.ocrEngine ??
      projectStore.curProject?.settings?.ocrEngine ??
      1,
    prompt: page.settings?.prompt ?? '',
    keyPrefix: page.settings?.keyPrefix ?? '',
    keySeparator:
      page.settings?.keySeparator ?? DEFAULT_KEY_CONVENTION.separator,
    keyStyle: page.settings?.keyStyle ?? DEFAULT_KEY_CONVENTION.style,
    keyMaxDepth:
      page.settings?.keyMaxDepth ?? DEFAULT_KEY_CONVENTION.maxDepth,
  },
  releaseIds:
    mode === 'create'
      ? defaultReleaseId
        ? [defaultReleaseId]
        : []
      : (page.releaseIds ?? []).map(Number),
})

/*
 * The page follows the project's key convention unless it says otherwise, and
 * this switch is that "otherwise". All four move together: a per-field mixture
 * ("prefix from the page, separator from the project") is not something the UI
 * could explain, so it is not something the form can produce.
 *
 * `keyPrefix` is the tell because it is the one field where a customised value
 * can legitimately be empty — which is also why it cannot double as "unset".
 */
const customKeyConvention = ref(
  page.settings?.keyPrefix !== null && page.settings?.keyPrefix !== undefined
)

/** What the project would supply, field by field. */
const projectConvention = computed(() => ({
  prefix: projectStore.curProject?.settings?.keyPrefix ?? '',
  separator:
    projectStore.curProject?.settings?.keySeparator ??
    DEFAULT_KEY_CONVENTION.separator,
  style:
    projectStore.curProject?.settings?.keyStyle ??
    DEFAULT_KEY_CONVENTION.style,
  maxDepth:
    projectStore.curProject?.settings?.keyMaxDepth ??
    DEFAULT_KEY_CONVENTION.maxDepth,
}))

/**
 * The four fields always show what will actually be used — the project's values
 * while inheriting, the page's own while customising — so the form never shows
 * one set of rules while another is in force. Switching to customising keeps
 * what is on screen, so the project's values become the starting point.
 */
function applyConvention(custom: boolean) {
  if (custom) return
  const inherited = projectConvention.value
  state.settings.keyPrefix = inherited.prefix
  state.settings.keySeparator = inherited.separator
  state.settings.keyStyle = inherited.style
  state.settings.keyMaxDepth = inherited.maxDepth
}
applyConvention(customKeyConvention.value)

/*
 * Not `v-model` plus a handler: both compile to `onUpdate:modelValue`, so the
 * handler would replace the ref write instead of running alongside it.
 */
function onCustomChange(value: boolean) {
  customKeyConvention.value = value
  applyConvention(value)
}
watch(
  () => state.settings.ocrLanguage,
  (value) => {
    if (value === 'auto') {
      state.settings.ocrEngine = 2
    }
  }
)
const showAlert = computed(() => {
  return state.settings.ocrLanguage === 'auto'
})

const title = computed(() => {
  switch (mode) {
    case 'create':
    default:
      return 'New Page'
    case 'edit':
      return 'Page Settings'
  }
})

const tabsItems = computed(() => [
  {
    label: 'Basic',
    icon: 'i-lucide:info',
    slot: 'basic',
  },
  {
    label: 'Prompt',
    icon: 'i-mage:stars-c',
    slot: 'prompt',
  },
  {
    label: 'Settings',
    icon: 'i-lucide:settings',
    slot: 'settings',
  },
])

const { createPage, updatePage } = usePageStore()
const isLoading = ref(false)
const uploaderRef =
  useTemplateRef<InstanceType<typeof ImageUploader>>('uploader')
async function onSubmit(_: FormSubmitEvent<ZPage>) {
  isLoading.value = true
  try {
    /*
     * Inheriting is written as nulls — never as a copy of the project's current
     * values, which would freeze them into the page and stop it following the
     * project from then on. Built as a payload rather than mutated into `state`
     * so the form never sees a null.
     */
    const payload = {
      ...state,
      settings: customKeyConvention.value
        ? state.settings
        : {
            ...state.settings,
            keyPrefix: null,
            keySeparator: null,
            keyStyle: null,
            keyMaxDepth: null,
          },
    }
    if (mode === 'edit') {
      // update page
      const uploadRes = await uploaderRef.value?.upload()
      if (uploadRes) {
        payload.image = uploadRes.key
      }
      await updatePage(page.id, uploadRes ? payload : omit(payload, 'image'))
    } else if (mode === 'create') {
      // create page
      const uploadRes = await uploaderRef.value?.upload()
      if (!uploadRes) return
      payload.image = uploadRes.key
      await createPage(payload)
    }
    emit('save', payload as Pick<IPage, 'name' | 'image' | 'settings'>, {
      close: () => emit('close', true),
    })
  } catch (error) {
    console.error('Create or Update page error:', error)
    toast.add({
      title: 'Error',
      description: 'Failed to create or update page:' + error,
      icon: 'i-lucide:circle-x',
      color: 'error',
    })
  } finally {
    isLoading.value = false
  }
}
</script>

<template>
  <UModal
    :title="title"
    :dismissible="!isLoading"
    @update:open="(isOpen) => !isOpen && emit('close', false)"
  >
    <template #body>
      <UForm
        class="flex flex-col gap-2.5"
        :schema="zPage"
        :state="state"
        @submit="onSubmit"
      >
        <UTabs :items="tabsItems" variant="link" :ui="{ trigger: 'grow' }">
          <template #basic>
            <div class="flex flex-col gap-2.5">
              <UFormField label="Name" name="name">
                <UInput
                  v-model="state.name"
                  class="w-full"
                  :disabled="mode === 'view' || isLoading"
                />
              </UFormField>
              <UFormField label="Image" name="image">
                <div class="flex justify-center">
                  <ImageUploader
                    ref="uploader"
                    class="w-[200px]"
                    :url="previewUrl"
                    :file="file"
                    :disabled="mode === 'view' || isLoading"
                    :auto-upload="false"
                    @delete="emit('delete')"
                  />
                </div>
              </UFormField>
              <UFormField label="Releases" name="releaseIds">
                <ReleaseSelect
                  v-model="state.releaseIds"
                  :disabled="mode === 'view' || isLoading"
                />
              </UFormField>
            </div>
          </template>
          <template #prompt>
            <MarkdownPrompt v-model="state.settings.prompt"/>
          </template>
          <template #settings>
            <div class="flex flex-col gap-2.5">
              <!--
                Not `text-sm font-medium`: that is what the field labels below
                already use, so a heading in those clothes reads as one more
                label rather than as a section.
              -->
              <h3 class="text-xs font-medium text-muted uppercase">OCR</h3>
              <div class="flex items-center gap-4">
                <UFormField
                  class="flex-1"
                  label="OCR Language"
                  name="settings.ocrLanguage"
                >
                  <OCRLanguageSelect
                    v-model="state.settings.ocrLanguage"
                    class="w-full"
                    default-value="eng"
                  />
                </UFormField>
                <UFormField
                  class="flex-1"
                  label="OCR Engine"
                  name="settings.ocrEngine"
                >
                  <OCREngineSelect
                    v-model="state.settings.ocrEngine"
                    class="w-full"
                    :disabled="showAlert"
                    :default-value="1"
                  />
                </UFormField>
              </div>
              <UAlert
                v-if="showAlert"
                variant="soft"
                color="warning"
                title="Warning"
                description="Auto language detection is only supported by Engine 2."
              />
              <h3 class="text-xs font-medium text-muted uppercase">
                AI key naming
              </h3>
              <USwitch
                :model-value="customKeyConvention"
                label="Custom key convention"
                description="Off, this page follows the project's key naming rules."
                :disabled="mode === 'view' || isLoading"
                @update:model-value="onCustomChange"
              />
              <div class="flex items-center gap-4">
                <UFormField
                  class="flex-1"
                  label="Key Prefix"
                  name="settings.keyPrefix"
                >
                  <UInput
                    v-model="state.settings.keyPrefix"
                    class="w-full"
                    :disabled="!customKeyConvention || isLoading"
                  />
                </UFormField>
                <UFormField
                  class="flex-1"
                  label="Key Separator"
                  name="settings.keySeparator"
                >
                  <UInput
                    v-model="state.settings.keySeparator"
                    class="w-full font-mono"
                    :disabled="!customKeyConvention || isLoading"
                  />
                </UFormField>
              </div>
              <div class="flex items-center gap-4">
                <UFormField
                  class="flex-1"
                  label="Key Style"
                  name="settings.keyStyle"
                >
                  <USelect
                    v-model="state.settings.keyStyle"
                    :items="KEY_STYLES"
                    class="w-full"
                    :disabled="!customKeyConvention || isLoading"
                  />
                </UFormField>
                <UFormField
                  class="flex-1"
                  label="Key Max Depth"
                  name="settings.keyMaxDepth"
                >
                  <UInput
                    v-model.number="state.settings.keyMaxDepth"
                    type="number"
                    class="w-full"
                    :min="1"
                    :max="10"
                    :disabled="!customKeyConvention || isLoading"
                  />
                </UFormField>
              </div>
              <UAlert
                variant="soft"
                color="neutral"
                icon="i-lucide:info"
                description="Used when the AI names a key: what the generated key must look like. Leave the prefix empty for none."
              />
            </div>
          </template>
        </UTabs>

        <div class="w-full flex justify-end gap-6 mt-4">
          <UButton
            color="neutral"
            variant="ghost"
            label="Cancel"
            :disabled="isLoading"
            @click="emit('close', false)"
          />
          <UButton
            label="Submit"
            type="submit"
            :loading="isLoading"
            icon="i-lucide-save"
          />
        </div>
      </UForm>
    </template>
  </UModal>
</template>
