<script setup lang="tsx">
import type { TableColumn, TableRow } from '@nuxt/ui'
import { TeamRole, UserRole } from '#shared/constants'
import { AlertModal, UBadge, UButton, UTooltip, UserAvatar } from '#components'

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
const { openSettings, openExport } = useProjectActions()
const overlay = useOverlay()
const detail = ref<ITeam | null>(null)
const loading = ref(false)
const creating = ref(false)
const inviting = ref(false)
const creatingCode = ref(false)
const leaving = ref(false)
const deleting = ref(false)
const newTeamName = ref('')
const inviteUsername = ref('')
const inviteCodes = ref<ITeamInviteCode[]>([])
const newCodeRole = ref<TeamRole>(TeamRole.MEMBER)
const newCodeMaxUses = ref(20)
const newCodeUnlimited = ref(false)
const newCodeNeverExpires = ref(false)
const newCodeExpiresAt = ref('')
const createTeamOpen = ref(false)
const newCodeOpen = ref(false)

const { joinCode, joining, joinWithCode } = useJoinTeamByCode(async (team) => {
  await loadTeams()
  selectedId.value = team.id
  await loadDetail()
})

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
// An ADMIN sees every team through `GET /api/teams`, including ones they are not
// on, so "has a role here" is not the same as "is an admin".
const isMember = computed(() => Boolean(myRole.value))

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
            <UserAvatar
              avatar={member?.avatar}
              name={member?.nickname || member?.username}
              size="sm"
            />
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
      cell: ({ row }: { row: TableRow<ITeamMember> }) => {
        // Demoting or removing the only OWNER would leave the team unmanageable,
        // so both are blocked on the same condition the server checks.
        const isLastOwner =
          row.original.role === TeamRole.OWNER && ownerCount(detail.value) <= 1
        return (
          <div class="flex items-center justify-end gap-1">
            {row.original.role === TeamRole.MEMBER ? (
              <UButton
                size="xs"
                color="neutral"
                variant="ghost"
                label="Make owner"
                onClick={() =>
                  setMemberRole(row.original.userId, TeamRole.OWNER)
                }
              />
            ) : (
              <UTooltip
                text="A team must keep at least one OWNER"
                disabled={!isLastOwner}
              >
                <UButton
                  size="xs"
                  color="neutral"
                  variant="ghost"
                  label="Make member"
                  disabled={isLastOwner}
                  onClick={() =>
                    setMemberRole(row.original.userId, TeamRole.MEMBER)
                  }
                />
              </UTooltip>
            )}
            <UButton
              size="xs"
              color="error"
              variant="ghost"
              label="Remove"
              disabled={isLastOwner}
              onClick={() => removeMember(row.original.userId)}
            />
          </div>
        )
      },
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
    inviteCodes.value = []
    return
  }
  loading.value = true
  try {
    detail.value = await useApi<ITeam>(`/api/teams/${selectedId.value}`)
    await loadInviteCodes()
  } finally {
    loading.value = false
  }
}

async function loadInviteCodes() {
  if (!validID(selectedId.value) || !isOwner.value) {
    inviteCodes.value = []
    return
  }
  inviteCodes.value =
    (await useApi<ITeamInviteCode[]>(
      `/api/teams/${selectedId.value}/invite-codes`
    )) ?? []
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
    createTeamOpen.value = false
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
      title: 'Invite sent',
      color: 'success',
      icon: 'i-lucide:check',
    })
    await loadTeams()
    await loadDetail()
  } finally {
    inviting.value = false
  }
}

async function createInviteCode() {
  if (!validID(selectedId.value)) return
  creatingCode.value = true
  try {
    const created = await useApi<ITeamInviteCode>(
      `/api/teams/${selectedId.value}/invite-codes`,
      {
        method: 'POST',
        body: {
          role: newCodeRole.value,
          maxUses: newCodeUnlimited.value ? null : newCodeMaxUses.value,
          expiresAt: newCodeNeverExpires.value
            ? null
            : newCodeExpiresAt.value
              ? new Date(newCodeExpiresAt.value).toISOString()
              : undefined,
        },
      }
    )
    if (!created) return
    toast.add({
      title: 'Invite code created',
      description: created.code,
      color: 'success',
      icon: 'i-lucide:check',
    })
    await loadInviteCodes()
    newCodeOpen.value = false
  } finally {
    creatingCode.value = false
  }
}

async function copyInviteCode(code: string) {
  await navigator.clipboard.writeText(code)
  toast.add({
    title: 'Copied',
    description: code,
    color: 'success',
    icon: 'i-lucide:copy',
  })
}

async function revokeInviteCode(codeId: ID) {
  if (!validID(selectedId.value)) return
  await useApi(`/api/teams/${selectedId.value}/invite-codes/${codeId}`, {
    method: 'DELETE',
  })
  toast.add({
    title: 'Invite code revoked',
    color: 'success',
    icon: 'i-lucide:check',
  })
  await loadInviteCodes()
}

function codeMeta(row: ITeamInviteCode) {
  const uses =
    row.remainingUses == null ? 'Unlimited' : `${row.remainingUses} left`
  const expiry = row.expiresAt
    ? new Date(row.expiresAt).toLocaleDateString()
    : 'No expiry'
  return `${row.role} · ${uses} · ${expiry}`
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

async function setMemberRole(userId: ID, role: TeamRole) {
  if (!validID(selectedId.value)) return
  await useApi(`/api/teams/${selectedId.value}/members/${userId}`, {
    method: 'PATCH',
    body: { role },
  })
  toast.add({
    title: role === TeamRole.OWNER ? 'Promoted to OWNER' : 'Changed to MEMBER',
    color: 'success',
    icon: 'i-lucide:check',
  })
  await loadTeams()
  await loadDetail()
}

/**
 * Leaving is the same endpoint as removing somebody, so the "a team must keep at
 * least one OWNER" rule is enforced in one place. The button is disabled rather
 * than letting the request 400, and says what to do instead.
 */
const leaveBlockedReason = computed(() => {
  if (!isMember.value) return 'You are not a member of this team'
  if (!isOwner.value) return ''
  if (ownerCount(detail.value) > 1) return ''
  return members.value.length > 1
    ? 'Promote another member to OWNER first'
    : 'You are the only member — delete the team instead'
})

/** Mirrors `teamDeleteRejectReason` on the server. */
const deleteBlockedReason = computed(() => {
  if (!isOwner.value) return 'Only an OWNER can delete a team'
  if (members.value.length > 1) return 'Remove the other members first'
  if (teamProjects.value.length > 0) return 'Delete this team’s projects first'
  return ''
})

/** Both actions cost the user their access, so neither fires on a single click. */
const leaveModal = overlay.create(AlertModal)
const deleteModal = overlay.create(AlertModal)

async function afterTeamExit() {
  detail.value = null
  selectedId.value = undefined
  await loadTeams()
  await loadDetail()
}

function confirmLeaveTeam() {
  if (!validID(selectedId.value) || leaveBlockedReason.value) return
  leaveModal.open({
    mode: 'warning',
    title: 'Leave team',
    message: `Leave “${detail.value?.name}”? You lose access to its projects and need a new invite to come back.`,
    okText: 'Leave',
    onOk: async (_mode, { close }) => {
      leaving.value = true
      try {
        await useApi(`/api/teams/${selectedId.value}/members/${user.value.id}`, {
          method: 'DELETE',
        })
        toast.add({
          title: 'Left team',
          color: 'success',
          icon: 'i-lucide:check',
        })
        close()
        await afterTeamExit()
      } finally {
        leaving.value = false
      }
    },
  })
}

function confirmDeleteTeam() {
  if (!validID(selectedId.value) || deleteBlockedReason.value) return
  deleteModal.open({
    mode: 'delete',
    title: 'Delete team',
    message: `Delete “${detail.value?.name}”? This cannot be undone. Its invite codes and any pending invites are dropped.`,
    onOk: async (_mode, { close }) => {
      deleting.value = true
      try {
        await useApi(`/api/teams/${selectedId.value}`, { method: 'DELETE' })
        toast.add({
          title: 'Team deleted',
          color: 'success',
          icon: 'i-lucide:check',
        })
        close()
        await afterTeamExit()
      } finally {
        deleting.value = false
      }
    },
  })
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
      class="shrink-0 h-14 px-6 bg-default border-b border-default flex items-center gap-2"
    >
      <h1 class="text-lg font-semibold tracking-tight">Teams</h1>
      <span class="ml-auto" />
      <form class="flex items-center gap-2" @submit.prevent="joinWithCode">
        <UInput
          v-model="joinCode"
          size="sm"
          class="w-44"
          placeholder="Invite code"
        />
        <UButton
          type="submit"
          size="sm"
          label="Join"
          :loading="joining"
          :disabled="!joinCode.trim()"
        />
      </form>
      <UPopover v-if="isAdmin" v-model:open="createTeamOpen">
        <UButton
          size="sm"
          color="neutral"
          variant="outline"
          icon="i-lucide:plus"
          label="Team"
        />
        <template #content>
          <form class="p-3 flex items-center gap-2" @submit.prevent="createTeam">
            <UInput
              v-model="newTeamName"
              size="sm"
              class="w-44"
              placeholder="Team name"
            />
            <UButton
              type="submit"
              size="sm"
              label="Create"
              :loading="creating"
              :disabled="newTeamName.trim().length < 2"
            />
          </form>
        </template>
      </UPopover>
    </header>

    <div class="flex-1 min-h-0 grid grid-cols-[18rem_minmax(0,1fr)]">
      <aside class="border-r border-default bg-default overflow-auto p-3">
        <p class="px-2 py-1.5 text-xs font-medium text-muted uppercase tracking-wide">
          Your teams
        </p>
        <div v-if="teams.length === 0" class="px-2 py-8 text-sm text-muted">
          No teams yet. Join with an invite code, or ask an ADMIN to create one.
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
            <UTooltip
              v-if="isMember"
              :text="leaveBlockedReason"
              :disabled="!leaveBlockedReason"
            >
              <UButton
                color="neutral"
                variant="outline"
                icon="i-lucide:log-out"
                label="Leave team"
                :loading="leaving"
                :disabled="Boolean(leaveBlockedReason)"
                @click="confirmLeaveTeam"
              />
            </UTooltip>
            <UTooltip
              v-if="isOwner"
              :text="deleteBlockedReason"
              :disabled="!deleteBlockedReason"
            >
              <UButton
                color="error"
                variant="outline"
                icon="i-lucide:trash-2"
                label="Delete team"
                :loading="deleting"
                :disabled="Boolean(deleteBlockedReason)"
                @click="confirmDeleteTeam"
              />
            </UTooltip>
          </div>

          <div
            v-if="isOwner"
            class="shrink-0 rounded-xl border border-default bg-default overflow-hidden"
          >
            <div class="px-4 py-2.5 flex items-center gap-2">
              <h3 class="text-sm font-semibold">Invite codes</h3>
              <span class="ml-auto" />
              <UPopover v-model:open="newCodeOpen">
                <UButton
                  size="xs"
                  color="neutral"
                  variant="outline"
                  icon="i-lucide:plus"
                  label="New"
                />
                <template #content>
                  <form
                    class="p-3 w-64 flex flex-col gap-2.5"
                    @submit.prevent="createInviteCode"
                  >
                    <UFormField label="Role">
                      <USelect
                        v-model="newCodeRole"
                        class="w-full"
                        :items="[
                          { label: 'MEMBER', value: TeamRole.MEMBER },
                          { label: 'OWNER', value: TeamRole.OWNER },
                        ]"
                      />
                    </UFormField>
                    <UFormField label="Max uses">
                      <UInput
                        v-model.number="newCodeMaxUses"
                        type="number"
                        min="1"
                        :disabled="newCodeUnlimited"
                      />
                    </UFormField>
                    <UCheckbox v-model="newCodeUnlimited" label="No limit" />
                    <UFormField label="Expires">
                      <UInput
                        v-model="newCodeExpiresAt"
                        type="datetime-local"
                        :disabled="newCodeNeverExpires"
                      />
                    </UFormField>
                    <UCheckbox
                      v-model="newCodeNeverExpires"
                      label="Never expires"
                    />
                    <UButton
                      type="submit"
                      size="sm"
                      label="Create"
                      :loading="creatingCode"
                    />
                  </form>
                </template>
              </UPopover>
            </div>
            <div
              v-if="inviteCodes.length === 0"
              class="px-4 pb-3 text-xs text-muted"
            >
              None yet. New codes last 14 days and 20 joins.
            </div>
            <ul v-else class="border-t border-default divide-y divide-default">
              <li
                v-for="row in inviteCodes"
                :key="row.id"
                class="px-4 py-2 flex items-center gap-3"
              >
                <code class="text-sm font-medium tracking-wide">{{
                  row.code
                }}</code>
                <span class="text-xs text-muted truncate">{{
                  codeMeta(row)
                }}</span>
                <span class="ml-auto" />
                <UButton
                  size="xs"
                  color="neutral"
                  variant="ghost"
                  icon="i-lucide:copy"
                  square
                  @click="copyInviteCode(row.code)"
                />
                <UButton
                  size="xs"
                  color="error"
                  variant="ghost"
                  icon="i-lucide:x"
                  square
                  @click="revokeInviteCode(row.id)"
                />
              </li>
            </ul>
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
                v-if="isMember"
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
                  icon="i-tabler:package-export"
                  @click="openExport(project)"
                />
                <ProjectOwnersPopover
                  v-if="isOwner"
                  :project-id="project.id"
                />
                <UButton
                  v-if="canManageProjectSettings(project)"
                  size="xs"
                  color="neutral"
                  variant="ghost"
                  icon="i-lucide:settings-2"
                  @click="openSettings(project)"
                />
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
