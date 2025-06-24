<script setup lang="ts">
import type { IPage } from '~/types/interfaces'
import type { FormSubmitEvent } from '@nuxt/ui'
import { Page } from '~/types/PageClass'
import { z } from 'zod/v4'
import type { ImageUploader } from '#components'

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
  save: [Pick<IPage, 'name'>, { close: () => void }]
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
})
type ZPage = z.output<typeof zPage>
const state = reactive<ZPage>({ name: page.name, image: page.image })

const title = computed(() => {
  switch (mode) {
    case 'create':
    default:
      return 'New Page'
    case 'edit':
      return `Edit Page: ${page.name}`
    case 'view':
      return 'View Page'
  }
})

const { createPage, updatePage } = usePageStore()
const isLoading = ref(false)
const uploaderRef =
  useTemplateRef<InstanceType<typeof ImageUploader>>('uploader')
async function onSubmit(_: FormSubmitEvent<ZPage>) {
  isLoading.value = true
  try {
    if (mode === 'edit') {
      // update page
      const res = await uploaderRef.value?.upload()
      await updatePage(
        page.id,
        res ? { name: state.name, image: res.key } : { name: state.name }
      )
    } else if (mode === 'create') {
      // create page
      const res = await uploaderRef.value?.upload()
      if (!res) return
      await createPage({ name: state.name, image: res.key })
    }
    emit('save', state as Pick<IPage, 'name'>, {
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
    :close="{ onClick: () => emit('close', false) }"
  >
    <template #body>
      <UForm
        class="flex flex-col gap-2.5"
        :schema="zPage"
        :state="state"
        @submit="onSubmit"
      >
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
        <div class="w-full flex justify-end gap-6 mt-4">
          <UButton
            color="neutral"
            variant="ghost"
            label="Cancel"
            :disabled="isLoading"
            @click="emit('close', false)"
          />
          <UButton label="Submit" type="submit" :loading="isLoading" />
        </div>
      </UForm>
    </template>
  </UModal>
</template>
