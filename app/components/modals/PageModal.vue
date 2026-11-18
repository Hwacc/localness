<script setup lang="ts">
import type { FormSubmitEvent } from '@nuxt/ui'
import type { ImageUploader } from '#components'
import { omit } from 'lodash-es'
import {
  DEFAULT_KEY_CONVENTION,
  checkKeyPath,
  keyPathViolationText,
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

/* Not typed `ZPage`: the form holds `''` for "no key path", the API takes null. */
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
    keyPath: page.settings?.keyPath ?? '',
  },
  releaseIds:
    mode === 'create'
      ? defaultReleaseId
        ? [defaultReleaseId]
        : []
      : (page.releaseIds ?? []).map(Number),
})

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

const keyPathLead = computed(() => {
  const { prefix, separator } = projectConvention.value
  return prefix ? prefix + separator : ''
})

const keyPathError = computed(() => {
  const path = state.settings.keyPath.trim()
  if (!path) return undefined
  const violations = checkKeyPath(path, projectConvention.value)
  return violations.length
    ? violations.map(keyPathViolationText).join('; ')
    : undefined
})

const keyPathExample = computed(() => {
  const path = state.settings.keyPath.trim()
  const { separator } = projectConvention.value
  return keyPathLead.value + (path ? path + separator : '') + '…'
})
// PaddleX has no language option; OCR.space is the only one that reads it.
const showOcrLanguage = useRuntimeConfig().public.ocrProvider === 'ocrspace'

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
  if (keyPathError.value) return
  isLoading.value = true
  try {
    const payload = {
      ...state,
      settings: {
        ...state.settings,
        keyPath: state.settings.keyPath.trim() || null,
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
    :ui="{ content: 'sm:max-w-3xl' }"
    @update:open="(isOpen) => !isOpen && emit('close', false)"
  >
    <template #body>
      <UForm
        class="flex flex-col gap-2.5"
        :schema="zPage"
        :state="state"
        @submit="onSubmit"
      >
        <!--
          Panes stay mounted: the uploader owns the picked file until submit, so
          unmounting it on a tab switch throws that file away, and a submit made
          from another tab finds no uploader at all.
        -->
        <SettingsTabs :items="tabsItems" :unmount-on-hide="false">
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
              <template v-if="showOcrLanguage">
                <h3 class="text-xs font-medium text-muted uppercase">OCR</h3>
                <UFormField label="OCR Language" name="settings.ocrLanguage">
                  <OCRLanguageSelect
                    v-model="state.settings.ocrLanguage"
                    class="w-full"
                    default-value="eng"
                  />
                </UFormField>
              </template>
              <h3 class="text-xs font-medium text-muted uppercase">
                AI key naming
              </h3>
              <UFormField
                label="Key Path"
                name="settings.keyPath"
                :error="keyPathError"
                :help="`Generated keys look like ${keyPathExample}`"
              >
                <UFieldGroup class="w-full">
                  <UBadge
                    v-if="keyPathLead"
                    color="neutral"
                    variant="outline"
                    size="lg"
                    class="font-mono"
                    :label="keyPathLead"
                  />
                  <UInput
                    v-model="state.settings.keyPath"
                    class="w-full font-mono"
                    :placeholder="'e.g. ' + (projectStore.curNamespaces[0]?.name ?? 'login')"
                    :disabled="mode === 'view' || isLoading"
                  />
                </UFieldGroup>
              </UFormField>
              <KeyPathNamespaceHint
                :path="state.settings.keyPath"
                :separator="projectConvention.separator"
                :names="projectStore.curNamespaces.map((ns) => ns.name)"
                :project-id="
                  canManageProjectSettings(projectStore.curProject)
                    ? projectStore.curProject.id
                    : undefined
                "
                :disabled="mode === 'view' || isLoading"
                @pick="state.settings.keyPath = $event"
                @added="projectStore.getProjects()"
              />
              <UAlert
                variant="soft"
                color="neutral"
                icon="i-lucide:info"
                description="Used when the AI names a key on this page: segments placed after the project key prefix. Separator, style and max depth come from the project. Leave empty for none."
              />
            </div>
          </template>
        </SettingsTabs>

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
