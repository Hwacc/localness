<script setup lang="ts">
import { SkillModal, AlertModal } from '#components'
import { validID } from '#shared/utils'

definePageMeta({
  middleware: ['protected'],
  ssr: false,
})

type ProjectSkillRow = {
  id: number
  name: string
  description: string
  originalName: string
  createdBy: number
  createdAt: string
  updatedAt: string
  maintainerName: string
  maintainerUsername: string
}

const toast = useToast()
const overlay = useOverlay()
const store = useProjectStore()
const { curProject } = storeToRefs(store)
const { user } = useUserSession()
const { $dayjs } = useNuxtApp()

const q = ref('')
const loading = ref(false)
const rows = ref<ProjectSkillRow[]>([])

const projectId = computed(() => curProject.value?.id)
const myId = computed(() => Number(user.value?.id))

const skillModal = overlay.create(SkillModal)
const deleteModal = overlay.create(AlertModal)

async function load() {
  if (!validID(projectId.value)) {
    rows.value = []
    return
  }
  loading.value = true
  try {
    const params = new URLSearchParams()
    if (q.value.trim()) params.set('q', q.value.trim())
    const suffix = params.size ? `?${params}` : ''
    const list = await useApi<ProjectSkillRow[]>(
      `/api/projects/${projectId.value}/skills${suffix}`
    )
    rows.value = list ?? []
  } finally {
    loading.value = false
  }
}

function isMine(row: ProjectSkillRow) {
  return Number(row.createdBy) === myId.value
}

function openUpload() {
  if (!validID(projectId.value)) return
  skillModal.open({
    projectId: projectId.value,
    skill: null,
    onSaved: load,
  })
}

function openEdit(row: ProjectSkillRow) {
  if (!validID(projectId.value)) return
  skillModal.open({
    projectId: projectId.value,
    skill: row,
    onSaved: load,
  })
}

function openDelete(row: ProjectSkillRow) {
  if (!validID(projectId.value)) return
  deleteModal.open({
    mode: 'delete',
    title: 'Delete skill',
    message: `Delete “${row.name}”? The package file is removed too.`,
    onOk: async (_mode, { close }) => {
      deleteModal.patch({ loading: true })
      try {
        await useApi(`/api/projects/${projectId.value}/skills/${row.id}`, {
          method: 'DELETE',
        })
        toast.add({
          title: 'Deleted',
          color: 'success',
          icon: 'i-lucide:check',
        })
        close()
        await load()
      } finally {
        deleteModal.patch({ loading: false })
      }
    },
  })
}

function download(row: ProjectSkillRow) {
  if (!validID(projectId.value)) return
  window.open(
    `/api/projects/${projectId.value}/skills/${row.id}/file`,
    '_blank'
  )
}

function formatWhen(value: string) {
  const date = $dayjs(value)
  return date.isValid() ? date.format('YYYY-MM-DD HH:mm') : value
}

function packageKind(filename: string) {
  const lower = filename.toLowerCase()
  if (lower.endsWith('.md')) return 'Markdown'
  if (lower.endsWith('.skill')) return 'Skill bundle'
  if (lower.endsWith('.zip')) return 'Zip'
  return 'Package'
}

watch(projectId, () => {
  q.value = ''
  void load()
})

watch(q, () => {
  void load()
})

onMounted(() => {
  void load()
})
</script>

<template>
  <div class="h-full flex flex-col bg-muted">
    <header
      class="shrink-0 h-14 px-6 bg-default border-b border-default flex items-center gap-3"
    >
      <h1 class="text-lg font-semibold tracking-tight">Skills</h1>
      <UInput
        v-model="q"
        class="w-72"
        size="sm"
        icon="i-lucide:search"
        placeholder="Search name or description"
        :disabled="!validID(projectId)"
      />
      <span class="ml-auto" />
      <UButton
        size="sm"
        icon="i-lucide:upload"
        label="Upload"
        :disabled="!validID(projectId)"
        @click="openUpload"
      />
    </header>

    <div class="flex-1 min-h-0 overflow-auto p-6">
      <div
        v-if="!validID(projectId)"
        class="rounded-xl border border-dashed border-default bg-default px-4 py-12 text-center text-sm text-muted"
      >
        Select a project to share skills with the team.
      </div>
      <div
        v-else-if="!loading && rows.length === 0"
        class="rounded-xl border border-dashed border-default bg-default px-4 py-12 text-center"
      >
        <UIcon
          name="i-lucide:book-open"
          class="size-8 text-muted mx-auto"
        />
        <p class="mt-3 text-sm text-muted">
          No skills yet. Upload a zip with SKILL.md, or a single markdown file.
        </p>
      </div>
      <div
        v-else-if="rows.length > 0"
        class="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3"
      >
        <article
          v-for="row in rows"
          :key="row.id"
          class="flex flex-col rounded-xl border border-default bg-default p-4 transition-colors hover:border-muted"
        >
          <div class="flex items-start gap-3 min-w-0">
            <div
              class="size-10 shrink-0 rounded-lg bg-elevated/80 flex items-center justify-center text-muted"
            >
              <UIcon name="i-lucide:book-open" class="size-5" />
            </div>
            <div class="min-w-0 flex-1">
              <p class="font-medium text-highlighted truncate">
                {{ row.name }}
              </p>
              <p class="mt-0.5 text-xs text-muted truncate">
                {{ packageKind(row.originalName) }}
                · {{ row.originalName }}
              </p>
            </div>
          </div>
          <p class="mt-3 text-sm text-muted line-clamp-3 flex-1">
            {{ row.description }}
          </p>
          <div class="mt-4 flex items-center gap-2 min-w-0">
            <UIcon
              name="i-lucide:user"
              class="size-3.5 shrink-0 text-muted"
            />
            <p class="text-xs truncate">
              <span class="text-highlighted">{{ row.maintainerName }}</span>
              <span class="text-muted">
                @{{ row.maintainerUsername }}
              </span>
            </p>
          </div>
          <p class="mt-1 text-xs text-muted">
            Updated {{ formatWhen(row.updatedAt) }}
          </p>
          <div class="mt-4 flex flex-wrap gap-2">
            <UButton
              size="xs"
              color="neutral"
              variant="outline"
              icon="i-lucide:download"
              label="Download"
              @click="download(row)"
            />
            <UButton
              v-if="isMine(row)"
              size="xs"
              color="neutral"
              variant="ghost"
              icon="i-lucide:pencil"
              label="Edit"
              @click="openEdit(row)"
            />
            <UButton
              v-if="isMine(row)"
              size="xs"
              color="error"
              variant="ghost"
              icon="i-lucide:trash"
              label="Delete"
              @click="openDelete(row)"
            />
          </div>
        </article>
      </div>
    </div>
  </div>
</template>
