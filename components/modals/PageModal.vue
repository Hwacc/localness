<script setup lang="ts">
import type { IPage } from '~/types/interfaces'
import type { FormSubmitEvent } from '@nuxt/ui'
import { Page } from '~/types/page'
import { z } from 'zod/v4'

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

const previewUrl = computed(() => {
  if (page.image) return page.image
  if (file) return URL.createObjectURL(file)
  return ''
})

const schema = z.object({
  name: z.string().min(3),
})
type Schema = z.output<typeof schema>
const state = reactive<Schema>({ name: page.name })

const title = computed(() => {
  switch (mode) {
    case 'create':
    default:
      return 'New Page'
    case 'edit':
      return 'Edit Page'
    case 'view':
      return 'View Page'
  }
})

async function onSubmit(_: FormSubmitEvent<Schema>) {
  emit('save', state as Pick<IPage, 'name'>, {
    close: () => emit('close', true),
  })
}
</script>

<template>
  <UModal :title="title" :close="{ onClick: () => emit('close', false) }">
    <template #body>
      <UForm
        class="flex flex-col gap-2.5"
        :schema="schema"
        :state="state"
        @submit="onSubmit"
      >
        <UFormField label="Name" name="name">
          <UInput
            v-model="state.name"
            class="w-full"
            :disabled="mode === 'view'"
          />
        </UFormField>
        <UFormField label="Image">
          <ImageUploader
            class="w-[200px]"
            :url="previewUrl"
            :file="file"
            :disabled="mode === 'view'"
            @delete="emit('delete')"
          />
        </UFormField>
        <div class="w-full flex justify-end gap-6 mt-4">
          <UButton
            color="neutral"
            variant="ghost"
            label="Cancel"
            @click="emit('close', false)"
          />
          <UButton label="Submit" type="submit" />
        </div>
      </UForm>
    </template>
  </UModal>
</template>
