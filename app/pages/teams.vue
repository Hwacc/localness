<script setup lang="ts">
import { TeamRole, UserRole } from '#shared/constants'

definePageMeta({
  middleware: ['protected'],
})

const userStore = useUserStore()
const { user } = storeToRefs(userStore)
const { loggedIn } = useUserSession()
const toast = useToast()

const teams = ref<ITeam[]>([])
const selectedId = ref<ID | undefined>()
const detail = ref<ITeam | null>(null)
const loading = ref(false)
const creating = ref(false)
const inviting = ref(false)
const newTeamName = ref('')
const inviteUsername = ref('')

const isAdmin = computed(() => user.value.role === UserRole.ADMIN)
const myRole = computed(() => detail.value?.role)
const isOwner = computed(() => myRole.value === TeamRole.OWNER)

const teamItems = computed(() =>
  teams.value.map((t) => ({
    label: t.name,
    value: t.id,
  }))
)

async function loadTeams() {
  const list = await useApi<ITeam[]>('/api/teams')
  teams.value = list ?? []
  if (
    teams.value.length > 0 &&
    !teams.value.some((t) => t.id === selectedId.value)
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

function ownerCount(team: ITeam | null) {
  return team?.members?.filter((m) => m.role === TeamRole.OWNER).length ?? 0
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

onMounted(async () => {
  if (loggedIn.value && !user.value.id) {
    await userStore.getUser()
  }
  await loadTeams()
  if (selectedId.value) await loadDetail()
})
</script>

<template>
  <div class="h-full flex flex-col p-4 gap-4 overflow-hidden">
    <div class="flex items-center gap-3 flex-wrap">
      <h1 class="text-lg font-bold">Teams</h1>
      <USelect
        v-model="selectedId"
        class="w-56"
        placeholder="Select team"
        :items="teamItems"
      />
      <form
        v-if="isAdmin"
        class="ml-auto flex items-center gap-2"
        @submit.prevent="createTeam"
      >
        <UInput
          v-model="newTeamName"
          class="w-48"
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
    </div>

    <div
      v-if="!detail"
      class="flex-1 flex items-center justify-center text-gray-500"
    >
      {{ teams.length ? 'Select a team.' : 'No teams yet. An ADMIN must create one.' }}
    </div>
    <div v-else class="flex-1 min-h-0 overflow-auto flex flex-col gap-4">
      <div class="flex items-baseline gap-3">
        <h2 class="text-base font-semibold">{{ detail.name }}</h2>
        <span class="text-xs text-gray-500">
          Your role: {{ myRole || (isAdmin ? 'ADMIN' : '—') }}
        </span>
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

      <table class="w-full text-sm border border-gray-200 rounded overflow-hidden">
        <thead class="bg-gray-50">
          <tr>
            <th class="p-2.5 text-left font-medium">Username</th>
            <th class="p-2.5 text-left font-medium">Nickname</th>
            <th class="p-2.5 text-left font-medium">Role</th>
            <th v-if="isOwner" class="p-2.5 text-left font-medium">Actions</th>
          </tr>
        </thead>
        <tbody>
          <tr v-if="loading">
            <td class="p-4 text-gray-400" :colspan="isOwner ? 4 : 3">Loading…</td>
          </tr>
          <tr
            v-for="member in detail.members"
            :key="`${member.userId}-${member.teamId}`"
            class="border-t border-gray-100"
          >
            <td class="p-2.5">{{ member.user?.username }}</td>
            <td class="p-2.5">{{ member.user?.nickname || '—' }}</td>
            <td class="p-2.5">
              <UBadge
                :color="member.role === TeamRole.OWNER ? 'primary' : 'neutral'"
                variant="subtle"
                size="sm"
              >
                {{ member.role }}
              </UBadge>
            </td>
            <td v-if="isOwner" class="p-2.5">
              <UButton
                size="xs"
                color="error"
                variant="ghost"
                label="Remove"
                :disabled="
                  member.role === TeamRole.OWNER && ownerCount(detail) <= 1
                "
                @click="removeMember(member.userId)"
              />
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  </div>
</template>
