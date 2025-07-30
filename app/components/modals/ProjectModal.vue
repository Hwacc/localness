<script setup lang="ts">
import type { FormSubmitEvent } from '@nuxt/ui'

type Mode = 'edit' | 'create'
const { mode, project = new Project('') } = defineProps<{
  mode: Mode
  project?: IProject
}>()

const state = reactive<ZProject>({
  name: project.name,
  description: project.description ?? '',
  settings: {
    ocrLanguage: project.settings?.ocrLanguage ?? 'eng',
    ocrEngine: project.settings?.ocrEngine ?? 1,
    prompt: project.settings?.prompt ?? '',
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
      return 'New Project'
    case 'edit':
      return 'Project Settings'
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

const emit = defineEmits<{
  close: [boolean]
  save: [
    Pick<IProject, 'name' | 'description' | 'settings'>,
    {
      close: () => void
    }
  ]
}>()

async function onSubmit(_: FormSubmitEvent<ZProject>) {
  console.log('submit', state)
  emit('save', state as Pick<IProject, 'name' | 'description' | 'settings'>, {
    close: () => emit('close', true),
  })
}
</script>

<template>
  <UModal
    :title="title"
    @update:open="(isOpen) => !isOpen && emit('close', false)"
  >
    <template #body>
      <UForm
        class="flex flex-col gap-2.5"
        :schema="zProject"
        :state="state"
        @submit="onSubmit"
      >
        <UTabs :items="tabsItems" variant="link" :ui="{ trigger: 'grow' }">
          <template #basic>
            <div class="flex flex-col gap-2.5">
              <UFormField label="Name" name="name">
                <UInput v-model="state.name" class="w-full" />
              </UFormField>
              <UFormField label="Description" name="description">
                <UTextarea
                  v-model="state.description"
                  class="w-full"
                  :rows="3"
                  :maxrows="3"
                  autoresize
                />
              </UFormField>
            </div>
          </template>
          <template #prompt>
            <MarkdownPrompt v-model="state.settings.prompt"/>
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
            @click="emit('close', false)"
          />
          <UButton label="Submit" type="submit" icon="i-lucide-save" />
        </div>
      </UForm>
    </template>
  </UModal>
</template>
