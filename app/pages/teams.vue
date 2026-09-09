<script setup lang="tsx">
import type { TableColumn, TableRow } from '@nuxt/ui'
import { TeamRole, UserRole } from '#shared/constants'
import { UAvatar, UBadge, UButton } from '#components'

definePageMeta({
  middleware: ['protected'],
  ssr: false,
})

const userStore = useUserStore()
const { user } = storeToRefs(userStore)
const { loggedIn } = useUserSession()
const toast = useToast()
const projectStore = useProjectStore()
const { teams, curTeamId, projects, curProject } = storeToRefs(projectStore)
const { open: openCreateProject } = useCreateProjectModal()
const detail = ref<ITeam | null>(null)
const loading = ref(false)
const creating = ref(false)
const inviting = ref(false)
const newTeamName = ref('')
const inviteUsername = ref('')

const selectedId = computed({
  get: () => curTeamId.value,
  set: (id: ID | undefined) => {
    projectStore.setCurrentTeam(id)
  },
})

const teamProjects = computed(() =>
  projects.value.filter((p) => String(p.teamId) === String(selectedId.value))
)

const isAdmin = computed(() => user.value.role === UserRole.ADMIN)
const myRole = computed(() => detail.value?.role)
const isOwner = computed(() => myRole.value === TeamRole.OWNER)

const members = computed(() => detail.value?.members ?? [])

function ownerCount(team: ITeam | null) {
  return team?.members?.filter((m) => m.role === TeamRole.OWNER).length ?? 0
}

const memberColumns = computed<TableColumn<ITeamMember>[]>(() => {
  const cols: TableColumn<ITeamMember>[] = [
    {
      id: 'user',
      accessorKey: 'user',
      header: 'Member',
      cell: ({ row }: { row: TableRow<ITeamMember> }) => {
        const member = row.original.user
        return (
          <div class="flex items-center gap-2.5">
            <UAvatar src={member?.avatar} size="sm" />
            <div class="min-w-0">
              <p class="font-medium truncate">{member?.username}</p>
              <p class="text-xs text-muted truncate">
                {member?.email || member?.nickname || '—'}
              </p>
            </div>
          </div>
        )
      },
    },
    {
      id: 'role',
      accessorKey: 'role',
      header: 'Role',
      cell: ({ row }: { row: TableRow<ITeamMember> }) => (
        <UBadge
          color={row.original.role === TeamRole.OWNER ? 'primary' : 'neutral'}
          variant="subtle"
        >
          {row.original.role}
        </UBadge>
      ),
    },
  ]
  if (isOwner.value) {
    cols.push({
      id: 'actions',
      header: '',
      cell: ({ row }: { row: TableRow<ITeamMember> }) => (
        <UButton
          size="xs"
          color="error"
          variant="ghost"
          label="Remove"
          disabled={
            row.original.role === TeamRole.OWNER && ownerCount(detail.value) <= 1
          }
          onClick={() => removeMember(row.original.userId)}
        />
      ),
    })
  }
  return cols
})

async function loadTeams() {
  await projectStore.getProjects()
  if (
    teams.value.length > 0 &&
    !teams.value.some((t) => String(t.id) === String(selectedId.value))
  ) {
    selectedId.value = teams.value[0]!.id
  }
}

async function loadDetail() {
  if (!validID(selectedId.value)) {
    detail.value = null
    return
  }
  loading.value = true
  try {
    detail.value = await useApi<ITeam>(`/api/teams/${selectedId.value}`)
  } finally {
    loading.value = false
  }
}

watch(selectedId, () => {
  loadDetail()
})

async function createTeam() {
  const name = newTeamName.value.trim()
  if (name.length < 2) return
  creating.value = true
  try {
    const created = await useApi<ITeam>('/api/teams', {
      method: 'POST',
      body: { name },
    })
    if (!created) return
    newTeamName.value = ''
    toast.add({
      title: 'Team created',
      color: 'success',
      icon: 'i-lucide:check',
    })
    await loadTeams()
    selectedId.value = created.id
  } finally {
    creating.value = false
  }
}

async function inviteMember() {
  const username = inviteUsername.value.trim()
  if (!username || !validID(selectedId.value)) return
  inviting.value = true
  try {
    await useApi(`/api/teams/${selectedId.value}/members`, {
      method: 'POST',
      body: { username },
    })
    inviteUsername.value = ''
    toast.add({
      title: 'Member invited',
      color: 'success',
      icon: 'i-lucide:check',
    })
    await loadTeams()
    await loadDetail()
  } finally {
    inviting.value = false
  }
}

async function removeMember(userId: ID) {
  if (!validID(selectedId.value)) return
  await useApi(`/api/teams/${selectedId.value}/members/${userId}`, {
    method: 'DELETE',
  })
  toast.add({
    title: 'Member removed',
    color: 'success',
    icon: 'i-lucide:check',
  })
  await loadTeams()
  await loadDetail()
}

function isSelected(id: ID) {
  return String(selectedId.value) === String(id)
}

onMounted(async () => {
  if (loggedIn.value && !user.value.id) {
    await userStore.getUser()
  }
  await loadTeams()
  if (selectedId.value) await loadDetail()
})
</script>

<template>
  <div class="h-full flex flex-col bg-muted">
    <header
      class="shrink-0 px-6 py-5 bg-default border-b border-default flex items-start justify-between gap-6"
    >
      <div class="min-w-0">
        <h1 class="text-xl font-semibold tracking-tight">Teams</h1>
        <p class="mt-1 text-sm text-muted">
          Create a team, invite existing users, and manage owners.
        </p>
      </div>
      <form
        v-if="isAdmin"
        class="flex items-center gap-2 shrink-0"
        @submit.prevent="createTeam"
      >
        <UInput
          v-model="newTeamName"
          class="w-52"
          placeholder="New team name"
        />
        <UButton
          type="submit"
          label="Create team"
          icon="i-lucide:plus"
          :loading="creating"
          :disabled="newTeamName.trim().length < 2"
        />
      </form>
    </header>

    <div class="flex-1 min-h-0 grid grid-cols-[18rem_minmax(0,1fr)]">
      <aside class="border-r border-default bg-default overflow-auto p-3">
        <p class="px-2 py-1.5 text-xs font-medium text-muted uppercase tracking-wide">
          Your teams
        </p>
        <div v-if="teams.length === 0" class="px-2 py-8 text-sm text-muted">
          No teams yet. An ADMIN must create one.
        </div>
        <button
          v-for="team in teams"
          :key="team.id"
          type="button"
          class="w-full text-left rounded-lg px-3 py-2.5 mb-1 transition-colors"
          :class="
            isSelected(team.id)
              ? 'bg-primary/10 text-highlighted'
              : 'hover:bg-elevated'
          "
          @click="selectedId = team.id"
        >
          <div class="font-medium truncate">{{ team.name }}</div>
          <div class="mt-0.5 text-xs text-muted">
            {{ team.members?.length ?? 0 }} members
            <span v-if="team.role"> · {{ team.role }}</span>
          </div>
        </button>
      </aside>

      <section class="min-h-0 flex flex-col p-6 gap-4 overflow-hidden">
        <div
          v-if="!detail"
          class="flex-1 flex items-center justify-center text-sm text-muted"
        >
          Select a team from the list.
        </div>
        <template v-else>
          <div
            class="shrink-0 rounded-xl border border-default bg-default px-5 py-4 flex flex-wrap items-center gap-4"
          >
            <div class="min-w-0 mr-auto">
              <h2 class="text-lg font-semibold truncate">{{ detail.name }}</h2>
              <p class="text-sm text-muted">
                Your role: {{ myRole || (isAdmin ? 'ADMIN' : '—') }}
              </p>
            </div>
            <form
              v-if="isOwner"
              class="flex items-center gap-2"
              @submit.prevent="inviteMember"
            >
              <UInput
                v-model="inviteUsername"
                class="w-56"
                placeholder="Invite by username"
              />
              <UButton
                type="submit"
                label="Invite"
                icon="i-lucide:user-plus"
                :loading="inviting"
                :disabled="!inviteUsername.trim()"
              />
            </form>
          </div>

          <div
            class="shrink-0 rounded-xl border border-default bg-default overflow-hidden"
          >
            <div
              class="px-5 py-3 border-b border-default flex items-center gap-2"
            >
              <h3 class="text-sm font-semibold">Projects</h3>
              <span class="ml-auto" />
              <UButton
                v-if="isOwner"
                size="xs"
                color="neutral"
                variant="outline"
                icon="i-lucide:plus"
                label="New Project"
                @click="openCreateProject(detail.id)"
              />
            </div>
            <div v-if="teamProjects.length === 0" class="px-5 py-6 text-sm text-muted">
              No projects in this team.
              <span v-if="!isOwner"> Ask a Team OWNER to create one.</span>
            </div>
            <ul v-else class="divide-y divide-default">
              <li
                v-for="project in teamProjects"
                :key="project.id"
                class="flex items-center gap-3 px-5 py-3"
              >
                <div class="min-w-0 flex-1">
                  <p class="font-medium truncate">{{ project.name }}</p>
                  <p class="text-xs text-muted">
                    {{ project.pages?.length ?? 0 }} pages
                  </p>
                </div>
                <UButton
                  size="xs"
                  color="neutral"
                  variant="ghost"
                  :label="
                    String(project.id) === String(curProject.id)
                      ? 'Current'
                      : 'Open'
                  "
                  @click="projectStore.setCurrentProject(project)"
                />
              </li>
            </ul>
          </div>

          <div
            class="flex-1 min-h-0 rounded-xl border border-default bg-default overflow-hidden flex flex-col"
          >
            <div class="flex-1 min-h-0 overflow-auto">
              <UTable
                class="w-full"
                :data="members"
                :columns="memberColumns"
                :loading="loading"
                :get-row-id="(row: ITeamMember) => `${row.userId}-${row.teamId}`"
              >
                <template #empty>
                  <div class="py-12 text-center text-sm text-muted">
                    No members in this team.
                  </div>
                </template>
              </UTable>
            </div>
          </div>
        </template>
      </section>
    </div>
  </div>
</template>
