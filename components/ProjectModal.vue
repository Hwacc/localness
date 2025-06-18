<script setup lang="ts">
import type { IProject } from '~/types/interfaces'
import { Project } from '~/types/project'
import { omit } from 'lodash-es'

const project = reactive<IProject>(new Project(''))

const emit = defineEmits<{
  close: [boolean]
  save: [Omit<IProject, 'id' | 'pages'>]
}>()
</script>

<template>
  <UModal :close="{ onClick: () => emit('close', false) }" title="New Project">
    <template #body>
      <div class="flex flex-col gap-2.5">
        <UFormField label="Name">
          <UInput v-model="project.name" class="w-full" />
        </UFormField>
      </div>
    </template>
    <template #footer>
      <div class="w-full flex justify-end gap-2">
        <UButton color="neutral" label="Cancel" @click="emit('close', false)" />
        <UButton
          label="Save"
          @click="
            () => {
              emit('save', omit(project, 'id', 'pages'))
              emit('close', true)
            }
          "
        />
      </div>
    </template>
  </UModal>
</template>
