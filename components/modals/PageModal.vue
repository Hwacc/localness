<script setup lang="ts">
import type { IPage } from '~/types/Page'
import type { FormSubmitEvent } from '@nuxt/ui'
import { Page } from '~/types/Page'
import { z } from 'zod/v4'
import type { ImageUploader } from '#components'
import { omit } from 'lodash-es'

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

const zPage = z.object({
  name: z.string().min(3),
  image: z.string(),
  settings: z.object({
    ocrLanguage: z.string(),
    ocrEngine: z.number(),
  }),
})
type ZPage = z.infer<typeof zPage>
const projectStore = useProjectStore()
const state = reactive<ZPage>({
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
  },
})
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
    if (mode === 'edit') {
      // update page
      const uploadRes = await uploaderRef.value?.upload()
      if (uploadRes) {
        state.image = uploadRes.key
      }
      await updatePage(page.id, uploadRes ? state : omit(state, 'image'))
    } else if (mode === 'create') {
      // create page
      const uploadRes = await uploaderRef.value?.upload()
      if (!uploadRes) return
      state.image = uploadRes.key
      await createPage(state)
    }
    emit('save', state as Pick<IPage, 'name' | 'image' | 'settings'>, {
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
            </div>
          </template>
          <template #settings>
            <div class="flex flex-col gap-2.5">
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
