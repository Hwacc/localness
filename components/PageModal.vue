<script setup lang="ts">
import type { IPage } from '~/types/interfaces'
import { Page } from '~/types/page'
import { z } from 'zod/v4'
import type { FormSubmitEvent } from '@nuxt/ui'

type Mode = 'edit' | 'create' | 'view'
const {
  mode,
  page = new Page(''),
  file,
} = defineProps<{
  mode: Mode
  file?: File
  page?: IPage
}>()

const schema = z.object({
  name: z.string().min(3),
})
type Schema = z.output<typeof schema>

const state = reactive<Schema>({
  name: page.name,
})

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

const emit = defineEmits<{
  close: [boolean]
  save: [
    Pick<IPage, 'name'>,
    {
      close: () => void
    }
  ]
}>()

async function onSubmit(_: FormSubmitEvent<Schema>) {
  emit('save', state as Pick<IPage, 'name'>, {
    close: () => emit('close', true),
  })
}
</script>

<template>
  <UModal :close="{ onClick: () => emit('close', false) }" :title="title">
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
        <div class="w-full flex justify-end gap-4 mt-4">
          <UButton
            color="neutral"
            label="Cancel"
            @click="emit('close', false)"
          />
          <UButton label="Submit" type="submit" />
        </div>
      </UForm>
    </template>
  </UModal>
</template>
