<script setup lang="ts">
type OwnerRow = {
  userId: ID
  username: string
  nickname: string | null
}

type CandidateRow = {
  userId: ID
  username: string
  nickname: string | null
}

const props = defineProps<{
  projectId: ID
}>()

const toast = useToast()
const projectStore = useProjectStore()
const open = ref(false)
const loading = ref(false)
const adding = ref(false)
const pick = ref<ID | undefined>()
const owners = ref<OwnerRow[]>([])
const candidates = ref<CandidateRow[]>([])
const canAppoint = ref(false)

function displayName(row: { username: string; nickname: string | null }) {
  return row.nickname || row.username
}

async function load() {
  loading.value = true
  try {
    const res = await useApi<{
      canAppoint: boolean
      owners: OwnerRow[]
      candidates: CandidateRow[]
    }>(`/api/projects/${props.projectId}/owners`)
    if (!res) return
    canAppoint.value = res.canAppoint
    owners.value = res.owners
    candidates.value = res.candidates
    pick.value = undefined
  } finally {
    loading.value = false
  }
}

watch(open, (isOpen) => {
  if (isOpen) void load()
})

const candidateItems = computed(() =>
  candidates.value.map((row) => ({
    label: displayName(row),
    value: row.userId,
  }))
)

const canRemove = computed(
  () => canAppoint.value && owners.value.length > 1
)

async function addOwner() {
  if (pick.value == null || !canAppoint.value) return
  adding.value = true
  try {
    await useApi(`/api/projects/${props.projectId}/owners`, {
      method: 'POST',
      body: { userId: Number(pick.value) },
    })
    toast.add({
      title: 'Project Owner added',
      color: 'success',
      icon: 'i-lucide:check',
    })
    await load()
    await projectStore.getProjects()
  } finally {
    adding.value = false
  }
}

async function removeOwner(userId: ID) {
  if (!canRemove.value) return
  await useApi(`/api/projects/${props.projectId}/owners/${userId}`, {
    method: 'DELETE',
  })
  toast.add({
    title: 'Project Owner removed',
    color: 'success',
    icon: 'i-lucide:check',
  })
  await load()
  await projectStore.getProjects()
}
</script>

<template>
  <UPopover v-model:open="open" :content="{ align: 'end' }">
    <UButton
      size="xs"
      color="neutral"
      variant="ghost"
      icon="i-lucide:user-cog"
      label="Owners"
    />
    <template #content>
      <div class="w-72 p-3 flex flex-col gap-3">
        <p class="text-sm font-medium">Project Owners</p>
        <p v-if="loading" class="text-xs text-muted">Loading…</p>
        <ul v-else class="flex flex-col gap-2">
          <li
            v-for="row in owners"
            :key="row.userId"
            class="flex items-center gap-2 text-sm"
          >
            <span class="min-w-0 truncate">{{ displayName(row) }}</span>
            <span class="ml-auto" />
            <UButton
              v-if="canRemove"
              size="xs"
              color="neutral"
              variant="ghost"
              icon="i-lucide:x"
              square
              @click="removeOwner(row.userId)"
            />
          </li>
          <li v-if="owners.length === 0" class="text-xs text-muted">
            No Project Owners. Ask an Admin to appoint one.
          </li>
        </ul>
        <div v-if="canAppoint && candidateItems.length > 0" class="flex gap-2">
          <USelect
            v-model="pick"
            class="min-w-0 flex-1"
            size="xs"
            placeholder="Add Team member"
            :items="candidateItems"
          />
          <UButton
            size="xs"
            label="Add"
            :loading="adding"
            :disabled="pick == null"
            @click="addOwner"
          />
        </div>
      </div>
    </template>
  </UPopover>
</template>
