<script setup lang="ts">
import JSZip from 'jszip'
import { SKILL_MAX_BYTES } from '#shared/constants'
import {
  newSkillStorageKey,
  skillPackageExt,
  zipListsSkillMd,
} from '#shared/utils/skill-package'

type SkillFormRow = {
  id: number
  name: string
  description: string
  originalName: string
}

const props = defineProps<{
  projectId: ID
  skill?: SkillFormRow | null
  onSaved?: () => void
}>()

const emit = defineEmits<{
  close: [boolean]
  saved: []
}>()

const toast = useToast()
const oss = useOSSUpload()
const loading = ref(false)
const isCreate = computed(() => !props.skill)

const name = ref(props.skill?.name ?? '')
const description = ref(props.skill?.description ?? '')
const picked = shallowRef<File | undefined>()
const fileLabel = computed(() =>
  picked.value?.name ?? props.skill?.originalName ?? 'No file selected'
)

function onPick(event: Event) {
  const input = event.target as HTMLInputElement
  picked.value = input.files?.[0]
}

async function assertSkillFile(file: File) {
  if (file.size > SKILL_MAX_BYTES) {
    throw new Error('File must be 5MB or smaller')
  }
  const ext = skillPackageExt(file.name)
  if (!ext) {
    throw new Error('Use a .zip, .skill, or .md file')
  }
  if (ext === 'md') return
  const zip = await JSZip.loadAsync(await file.arrayBuffer())
  const paths = Object.keys(zip.files).filter((path) => !zip.files[path]?.dir)
  if (!zipListsSkillMd(paths)) {
    throw new Error(
      'Zip must contain SKILL.md at the root or one folder down'
    )
  }
}

async function onSave() {
  if (!name.value.trim() || !description.value.trim()) {
    toast.add({
      title: 'Name and description are required',
      color: 'error',
    })
    return
  }
  if (isCreate.value && !picked.value) {
    toast.add({ title: 'Choose a skill package', color: 'error' })
    return
  }
  loading.value = true
  try {
    let storageKey: string | undefined
    let originalName: string | undefined
    if (picked.value) {
      await assertSkillFile(picked.value)
      storageKey = newSkillStorageKey(picked.value.name)
      const uploaded = await oss.upload(picked.value, storageKey)
      storageKey = uploaded.key
      originalName = picked.value.name
    }
    if (isCreate.value) {
      await useApi(`/api/projects/${props.projectId}/skills`, {
        method: 'POST',
        body: {
          name: name.value,
          description: description.value,
          storageKey,
          originalName,
        },
      })
    } else {
      await useApi(
        `/api/projects/${props.projectId}/skills/${props.skill!.id}`,
        {
          method: 'PATCH',
          body: {
            name: name.value,
            description: description.value,
            ...(storageKey
              ? { storageKey, originalName }
              : {}),
          },
        }
      )
    }
    emit('saved')
    props.onSaved?.()
    emit('close', true)
  } catch (error) {
    toast.add({
      title: 'Could not save skill',
      description: error instanceof Error ? error.message : undefined,
      color: 'error',
    })
  } finally {
    loading.value = false
  }
}
</script>

<template>
  <UModal
    :title="isCreate ? 'Upload skill' : 'Edit skill'"
    :ui="{ content: 'max-w-lg' }"
    @update:open="(isOpen) => !isOpen && emit('close', false)"
  >
    <template #body>
      <div class="flex flex-col gap-3">
        <UFormField label="Name" required>
          <UInput v-model="name" class="w-full" placeholder="i18n-assistant" />
        </UFormField>
        <UFormField label="Description" required>
          <UTextarea
            v-model="description"
            class="w-full"
            :rows="3"
            placeholder="When to use this skill"
          />
        </UFormField>
        <UFormField :label="isCreate ? 'Package' : 'Replace package'">
          <div class="flex flex-col gap-2">
            <input
              type="file"
              accept=".zip,.skill,.md,application/zip,text/markdown"
              @change="onPick"
            >
            <p class="text-xs text-muted">{{ fileLabel }}</p>
            <p class="text-xs text-muted">
              Zip or .skill with SKILL.md at the root (or one folder down), or a
              single .md file. Max 5MB.
            </p>
          </div>
        </UFormField>
      </div>
    </template>
    <template #footer>
      <div class="w-full flex items-center justify-end gap-4">
        <UButton
          color="neutral"
          variant="ghost"
          @click="emit('close', false)"
        >
          Cancel
        </UButton>
        <UButton :loading="loading" @click="onSave">
          {{ isCreate ? 'Upload' : 'Save' }}
        </UButton>
      </div>
    </template>
  </UModal>
</template>
