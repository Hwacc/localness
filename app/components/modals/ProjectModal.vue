<script setup lang="ts">
import type { FormSubmitEvent } from '@nuxt/ui'
import { AlertModal } from '#components'
import {
  DEFAULT_KEY_CONVENTION,
  KEY_STYLES,
  slugKeyPrefix,
} from '#shared/utils/key-convention'

type Mode = 'edit' | 'create'
const {
  mode,
  project = new Project(''),
  tab,
} = defineProps<{
  mode: Mode
  project?: IProject
  /** Which tab to open on. */
  tab?: ProjectSettingsTab
}>()

const projectStore = useProjectStore()
const overlay = useOverlay()
const confirmModal = overlay.create(AlertModal)

/*
 * Setup runs per open — the overlay unmounts its component when it closes — so
 * reading `tab` once here is enough, and "Manage releases…" always lands on
 * Releases even when the previous visit ended on another tab.
 */
const activeTab = ref<ProjectSettingsTab>(tab ?? 'basic')

const teams = ref<ITeam[]>([])
const ownedTeams = computed(() =>
  teams.value
    .filter((t) => Boolean(t.role))
    .map((t) => ({ label: t.name, value: t.id }))
)

const state = reactive({
  name: project.name,
  description: project.description ?? '',
  teamId: typeof project.teamId === 'number' ? project.teamId : undefined,
  settings: {
    ocrLanguage: project.settings?.ocrLanguage ?? 'eng',
    ocrEngine: project.settings?.ocrEngine ?? 1,
    prompt: project.settings?.prompt ?? '',
    keyPrefix: project.settings?.keyPrefix ?? '',
    keySeparator:
      project.settings?.keySeparator ?? DEFAULT_KEY_CONVENTION.separator,
    keyStyle: project.settings?.keyStyle ?? DEFAULT_KEY_CONVENTION.style,
    keyMaxDepth:
      project.settings?.keyMaxDepth ?? DEFAULT_KEY_CONVENTION.maxDepth,
  },
})

/**
 * The server seeds a new project's prefix from its name, so show what that
 * would be rather than an empty box that fills itself in after saving.
 */
const prefixPlaceholder = computed(() =>
  mode === 'create' ? slugKeyPrefix(state.name) : ''
)

/*
 * Releases are project config, so the same gate as the rest of Project Settings:
 * a ProjectOwner row, not a team role.
 */
const canManageReleases = computed(
  () => mode === 'edit' && canManageProjectSettings(project)
)

const releases = ref<IProjectRelease[]>([])
const releasesLoading = ref(false)
const newReleaseName = ref('')
const addingRelease = ref(false)
const renamingId = ref<ID | null>(null)
const renameValue = ref('')

async function loadReleases() {
  if (mode !== 'edit' || !validID(project.id)) return
  releasesLoading.value = true
  try {
    releases.value =
      (await useApi<IProjectRelease[]>(
        `/api/projects/${project.id}/releases`
      )) ?? []
  } finally {
    releasesLoading.value = false
  }
}

/** Labels live on the project payload too, so the bar's filter refreshes. */
async function refreshProject() {
  await loadReleases()
  await projectStore.getProjects()
}

async function addRelease() {
  const name = newReleaseName.value.trim()
  if (!name || !validID(project.id)) return
  addingRelease.value = true
  try {
    await useApi(`/api/projects/${project.id}/releases`, {
      method: 'POST',
      body: { name },
    })
    newReleaseName.value = ''
    await refreshProject()
  } finally {
    addingRelease.value = false
  }
}

function startRename(release: IProjectRelease) {
  renamingId.value = release.id
  renameValue.value = release.name
}

async function commitRename(release: IProjectRelease) {
  const name = renameValue.value.trim()
  renamingId.value = null
  if (!name || name === release.name) return
  await useApi(`/api/projects/${project.id}/releases/${release.id}`, {
    method: 'PATCH',
    body: { name },
  })
  await refreshProject()
}

function confirmRemoveRelease(release: IProjectRelease) {
  confirmModal.open({
    mode: 'delete',
    title: 'Delete release',
    // The label is all that goes; the copy says so because deleting content is
    // what a reader would fear here.
    message: `Delete “${release.name}”? Pages and translations are not deleted — they simply stop being filterable by this release.`,
    okText: 'Delete',
    onOk: async (_mode, { close }) => {
      await useApi(`/api/projects/${project.id}/releases/${release.id}`, {
        method: 'DELETE',
      })
      await refreshProject()
      close()
    },
  })
}

onMounted(async () => {
  if (mode !== 'edit') {
    if (mode === 'create') {
      teams.value = (await useApi<ITeam[]>('/api/teams')) ?? []
    }
    return
  }
  await loadReleases()
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
    value: 'basic',
  },
  {
    label: 'Prompt',
    icon: 'i-mage:stars-c',
    slot: 'prompt',
    value: 'prompt',
  },
  {
    label: 'Settings',
    icon: 'i-lucide:settings',
    slot: 'settings',
    value: 'settings',
  },
  // Only for an existing project (a new one has no id yet) and only for a
  // Project Owner — everyone else gets the list read-only via the bar's filter.
  ...(canManageReleases.value
    ? [
        {
          label: 'Releases',
          icon: 'i-lucide:tag',
          slot: 'releases',
          value: 'releases',
        },
      ]
    : []),
])

const emit = defineEmits<{
  close: [boolean]
  save: [
    Pick<IProject, 'name' | 'description' | 'settings' | 'teamId'>,
    {
      close: () => void
    }
  ]
}>()

async function onSubmit(_: FormSubmitEvent<ZProject>) {
  if (mode === 'create' && !state.teamId) {
    return
  }
  emit(
    'save',
    state as Pick<IProject, 'name' | 'description' | 'settings' | 'teamId'>,
    {
      close: () => emit('close', true),
    }
  )
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
        <UTabs
          v-model="activeTab"
          :items="tabsItems"
          variant="link"
          :ui="{ trigger: 'grow' }"
        >
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
              <UFormField
                v-if="mode === 'create'"
                label="Team"
                name="teamId"
              >
                <USelect
                  v-model="state.teamId"
                  class="w-full"
                  placeholder="Select a team"
                  :items="ownedTeams"
                />
              </UFormField>
              <UAlert
                v-if="mode === 'create' && ownedTeams.length === 0"
                variant="soft"
                color="warning"
                title="No team"
                description="You need to be in a team to create a project. Ask an Admin to create a team, or join with an invite code."
              />
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
              <h3 class="text-xs font-medium text-muted uppercase">OCR</h3>
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
              <h3 class="text-xs font-medium text-muted uppercase">
                AI key naming
              </h3>
              <div class="flex items-center gap-4">
                <UFormField
                  class="flex-1"
                  label="Key Prefix"
                  name="settings.keyPrefix"
                >
                  <UInput
                    v-model="state.settings.keyPrefix"
                    class="w-full"
                    :placeholder="prefixPlaceholder"
                  />
                </UFormField>
                <UFormField
                  class="flex-1"
                  label="Key Separator"
                  name="settings.keySeparator"
                >
                  <UInput
                    v-model="state.settings.keySeparator"
                    class="w-full font-mono"
                  />
                </UFormField>
              </div>
              <div class="flex items-center gap-4">
                <UFormField
                  class="flex-1"
                  label="Key Style"
                  name="settings.keyStyle"
                >
                  <USelect
                    v-model="state.settings.keyStyle"
                    :items="KEY_STYLES"
                    class="w-full"
                  />
                </UFormField>
                <UFormField
                  class="flex-1"
                  label="Key Max Depth"
                  name="settings.keyMaxDepth"
                >
                  <UInput
                    v-model.number="state.settings.keyMaxDepth"
                    type="number"
                    class="w-full"
                    :min="1"
                    :max="10"
                  />
                </UFormField>
              </div>
              <UAlert
                variant="soft"
                color="neutral"
                icon="i-lucide:info"
                description="Used when the AI names a key: what the generated key must look like. Leave the prefix empty for none."
              />
            </div>
          </template>
          <template #releases>
            <div class="flex flex-col gap-2.5">
              <p v-if="releasesLoading" class="text-xs text-muted">
                Loading…
              </p>
              <p v-else-if="releases.length === 0" class="text-xs text-muted">
                No releases yet. Create one to group pages and translations by
                the version they shipped in.
              </p>
              <ul v-else class="flex flex-col gap-1">
                <li
                  v-for="release in releases"
                  :key="release.id"
                  class="flex items-center gap-2"
                >
                  <UInput
                    v-if="renamingId === release.id"
                    v-model="renameValue"
                    class="min-w-0 flex-1"
                    size="sm"
                    autofocus
                    @blur="commitRename(release)"
                    @keydown.enter.prevent="commitRename(release)"
                    @keydown.esc="renamingId = null"
                  />
                  <button
                    v-else
                    type="button"
                    class="min-w-0 flex-1 truncate rounded px-2 py-1 text-left text-sm hover:bg-elevated"
                    @click="startRename(release)"
                  >
                    {{ release.name }}
                  </button>
                  <UButton
                    size="xs"
                    color="error"
                    variant="ghost"
                    icon="i-lucide:trash-2"
                    square
                    :aria-label="`Delete ${release.name}`"
                    @click="confirmRemoveRelease(release)"
                  />
                </li>
              </ul>
              <div class="flex items-center gap-2">
                <UInput
                  v-model="newReleaseName"
                  class="min-w-0 flex-1"
                  size="sm"
                  placeholder="New release name"
                  @keydown.enter.prevent="addRelease"
                />
                <UButton
                  size="sm"
                  label="Add"
                  icon="i-lucide:plus"
                  :loading="addingRelease"
                  :disabled="!newReleaseName.trim()"
                  @click="addRelease"
                />
              </div>
              <p class="text-xs text-muted">
                Renaming or deleting a release never touches the pages and
                translations on it.
              </p>
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
