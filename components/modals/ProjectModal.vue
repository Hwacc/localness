<script setup lang="ts">
import type { IProject } from '~/types/interfaces'
import type { FormSubmitEvent } from '@nuxt/ui'
import { Project } from '~/types/Project'
import { z } from 'zod/v4'

type Mode = 'edit' | 'create' | 'view'
const { mode, project = new Project('') } = defineProps<{
  mode: Mode
  project?: IProject
}>()

const schema = z.object({
  name: z.string().min(3),
  description: z.optional(z.string()),
})
type Schema = z.output<typeof schema>

const state = reactive<Schema>({
  name: project.name,
  description: project.description || '',
})

const title = computed(() => {
  switch (mode) {
    case 'create':
    default:
      return 'New Project'
    case 'edit':
      return 'Edit Project'
    case 'view':
      return 'View Project'
  }
})

const emit = defineEmits<{
  close: [boolean]
  save: [
    Pick<IProject, 'name' | 'description'>,
    {
      close: () => void
    }
  ]
}>()

async function onSubmit(_: FormSubmitEvent<Schema>) {
  emit('save', state as Pick<IProject, 'name' | 'description'>, {
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
        <UFormField label="Description" name="description">
          <UTextarea
            v-model="state.description"
            class="w-full"
            :disabled="mode === 'view'"
            :rows="3"
            :maxrows="3"
            autoresize
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
