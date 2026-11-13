<script setup lang="ts">
import JSZip from 'jszip'
import { SKILL_MAX_BYTES } from '#shared/constants'
import {
  SKILL_AGENT_CUSTOM_ICON,
  SKILL_AGENT_GENERAL,
  SKILL_AGENT_GENERAL_ICON,
  SKILL_AGENTS,
  SKILL_CUSTOM_AGENT_MAX,
  SKILL_CUSTOM_AGENT_MAX_LEN,
} from '#shared/constants/skill-agents'
import {
  newSkillStorageKey,
  skillPackageExt,
  zipListsSkillMd,
} from '#shared/utils/skill-package'
import {
  normalizeSkillAgents,
  type SkillAgents,
} from '#shared/utils/skill-agents'

type SkillFormRow = {
  id: number
  name: string
  description: string
  originalName: string
  agents: SkillAgents
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

/** Select value that reveals the custom-name input; never stored as an id. */
const CUSTOM = 'custom'
const initialAgents = props.skill?.agents ?? { ids: [], custom: [] }
const agentValues = ref<string[]>([
  ...initialAgents.ids,
  ...(initialAgents.custom.length ? [CUSTOM] : []),
])
const customNames = ref<string[]>([...initialAgents.custom])
const isGeneral = computed(() =>
  agentValues.value.includes(SKILL_AGENT_GENERAL)
)
const customOn = computed(() => agentValues.value.includes(CUSTOM))
const agentItems = computed(() => [
  {
    label: 'General',
    value: SKILL_AGENT_GENERAL,
    icon: SKILL_AGENT_GENERAL_ICON,
  },
  ...SKILL_AGENTS.map((agent) => ({
    label: agent.name,
    value: agent.id as string,
    icon: agent.icon as string,
    disabled: isGeneral.value,
  })),
  {
    label: 'Custom',
    value: CUSTOM,
    icon: SKILL_AGENT_CUSTOM_ICON,
    disabled: isGeneral.value,
  },
])

function onAgentsChange(next: string[]) {
  const generalAdded = next.includes(SKILL_AGENT_GENERAL) && !isGeneral.value
  agentValues.value = generalAdded ? [SKILL_AGENT_GENERAL] : next
  if (!agentValues.value.includes(CUSTOM)) customNames.value = []
}

function agentsBody() {
  return normalizeSkillAgents({
    ids: agentValues.value.filter((value) => value !== CUSTOM),
    custom: customOn.value ? customNames.value : [],
  })
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
    const agents = agentsBody()
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
          agents,
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
            agents,
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
        <UFormField
          label="Works with"
          :hint="isGeneral ? 'Any agent' : 'Optional'"
        >
          <USelectMenu
            :model-value="agentValues"
            :items="agentItems"
            value-key="value"
            multiple
            :search-input="false"
            class="w-full"
            placeholder="Not specified"
            @update:model-value="onAgentsChange"
          />
        </UFormField>
        <UFormField
          v-if="customOn"
          label="Custom agents"
          :hint="`${customNames.length}/${SKILL_CUSTOM_AGENT_MAX}`"
          :help="`Press Enter to add. Up to ${SKILL_CUSTOM_AGENT_MAX_LEN} characters each.`"
        >
          <UInputTags
            v-model="customNames"
            class="w-full"
            :max="SKILL_CUSTOM_AGENT_MAX"
            :max-length="SKILL_CUSTOM_AGENT_MAX_LEN"
            add-on-blur
            add-on-paste
            placeholder="Agent name"
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
