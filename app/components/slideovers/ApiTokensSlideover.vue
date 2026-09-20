<script setup lang="ts">
import { AlertModal, ApiTokenRevealModal } from '#components'

/**
 * Token management for one project. A slideover rather than page content:
 * issuing a credential is a one-off configuration task, while the documentation
 * on `/api` is what a consumer is there to read.
 *
 * Any Team Member may mint one. The server already narrows the list to your own
 * when you are not a steward, so every row shown is revocable by whoever is
 * looking — no per-row check needed. Erasing a row outright is different: purge
 * destroys the audit record rather than stopping the token, so it stays a
 * steward action, and a member looking at a revoked row has reached the end.
 *
 * No plaintext lives in this component. A new token goes straight into
 * `ApiTokenRevealModal`, whose Dismiss is the only way out, so closing this
 * drawer can never lose a token that has not been copied yet.
 */

type ApiTokenRow = {
  id: number
  name: string
  prefix: string
  createdBy: number
  creatorName: string
  createdAt: string
  revokedAt: string | null
  lastUsedAt: string | null
}

/** The page derives this from the store, so it can be an id-less project. */
const props = defineProps<{ projectId: ID | undefined }>()

const store = useProjectStore()
const isSteward = computed(() => canManageProjectSettings(store.curProject))

const { $dayjs } = useNuxtApp()
const overlay = useOverlay()
const confirmModal = overlay.create(AlertModal)
const revealModal = overlay.create(ApiTokenRevealModal)

const open = ref(false)
const tokens = ref<ApiTokenRow[]>([])
const loadingTokens = ref(false)
const newName = ref('')
const creating = ref(false)
const revokingId = ref<number | null>(null)
const purgingId = ref<number | null>(null)

async function loadTokens() {
  if (!validID(props.projectId)) {
    tokens.value = []
    return
  }
  loadingTokens.value = true
  try {
    tokens.value =
      (await useApi<ApiTokenRow[]>(
        `/api/projects/${props.projectId}/api-tokens`
      )) ?? []
  } finally {
    loadingTokens.value = false
  }
}

async function createToken() {
  const name = newName.value.trim()
  if (!name || !validID(props.projectId)) return
  creating.value = true
  try {
    const created = await useApi<ApiTokenRow & { token: string }>(
      `/api/projects/${props.projectId}/api-tokens`,
      { method: 'POST', body: { name } }
    )
    newName.value = ''
    // Revealed before the list reloads: the plaintext exists only in this one
    // response, so nothing that can fail is allowed to sit between the create
    // and the reveal.
    revealModal.open({
      token: created.token,
      name: created.name,
      // The overlay store holds whatever `open` was given until the next open,
      // so the plaintext has to be wiped there and not only off the screen.
      onDismiss: () => revealModal.patch({ token: '' }),
    })
    await loadTokens()
  } finally {
    creating.value = false
  }
}

async function revokeToken(row: ApiTokenRow) {
  if (!validID(props.projectId)) return
  revokingId.value = row.id
  try {
    await useApi(`/api/projects/${props.projectId}/api-tokens/${row.id}`, {
      method: 'DELETE',
    })
    await loadTokens()
  } finally {
    revokingId.value = null
  }
}

function confirmPurgeToken(row: ApiTokenRow) {
  confirmModal.open({
    mode: 'delete',
    title: 'Delete token',
    // The row is the only record that this credential ever existed, so the
    // copy has to say that plainly instead of implying a reversible disable.
    message: `Delete “${row.name}” permanently? This erases the record itself — its creation date and usage history go with it. A consumer still holding the token is already locked out.`,
    okText: 'Delete',
    onOk: async (_mode, { close }) => {
      purgingId.value = row.id
      try {
        await useApi(
          `/api/projects/${props.projectId}/api-tokens/${row.id}/purge`,
          { method: 'DELETE' }
        )
        await loadTokens()
        close()
      } finally {
        purgingId.value = null
      }
    },
  })
}

function formatDate(value: string | null | undefined) {
  if (!value) return 'Never'
  return $dayjs(value).format('YYYY-MM-DD HH:mm')
}

/**
 * Loaded on open rather than on mount, so the list is fresh each time. Watching
 * the project too is not optional: this component stays mounted across a
 * steward-to-steward project switch, and without it the drawer would show the
 * previous project's tokens while Create posts to the new one.
 */
watch(
  () => [open.value, props.projectId],
  ([isOpen]) => {
    if (isOpen) loadTokens()
  }
)
</script>

<template>
  <USlideover
    v-model:open="open"
    title="API tokens"
    description="Read-only credentials for this project."
    side="right"
    :close="{ icon: 'i-lucide:x' }"
    :ui="{ body: 'p-4 sm:p-4' }"
  >
    <UButton
      icon="i-lucide:key-round"
      color="neutral"
      variant="outline"
      size="sm"
    >
      Manage tokens
    </UButton>

    <template #body>
      <div class="flex flex-col gap-4">
        <div class="flex items-center gap-2">
          <UInput
            v-model="newName"
            class="flex-1"
            size="sm"
            placeholder="What is it for, e.g. MCP"
            @keyup.enter="createToken"
          />
          <UButton
            size="sm"
            :loading="creating"
            :disabled="!newName.trim()"
            @click="createToken"
          >
            Create token
          </UButton>
        </div>

        <div
          v-if="loadingTokens"
          class="text-sm text-muted"
        >
          Loading…
        </div>
        <div
          v-else-if="!tokens.length"
          class="rounded-lg border border-default p-3 text-sm text-muted"
        >
          No tokens yet. Create one to let a consumer read this project's
          published copy.
        </div>
        <div v-else class="flex flex-col gap-2">
          <div
            v-for="row in tokens"
            :key="row.id"
            class="rounded-lg border border-default p-3 flex items-center justify-between gap-3"
          >
            <div class="flex flex-col gap-0.5 min-w-0">
              <div class="flex items-center gap-2">
                <span class="text-sm font-medium truncate">{{ row.name }}</span>
                <UBadge
                  v-if="row.revokedAt"
                  size="sm"
                  color="error"
                  variant="subtle"
                >
                  Revoked
                </UBadge>
              </div>
              <code class="text-xs text-muted">{{ row.prefix }}…</code>
              <span class="text-xs text-muted">
                Created {{ formatDate(row.createdAt) }} · Last used
                {{ formatDate(row.lastUsedAt) }}
                <template v-if="isSteward"> · {{ row.creatorName }}</template>
              </span>
            </div>
            <UButton
              v-if="!row.revokedAt"
              size="xs"
              color="error"
              variant="subtle"
              :loading="revokingId === row.id"
              @click="revokeToken(row)"
            >
              Revoke
            </UButton>
            <UButton
              v-else-if="isSteward"
              size="xs"
              color="error"
              variant="ghost"
              icon="i-lucide:trash-2"
              :loading="purgingId === row.id"
              @click="confirmPurgeToken(row)"
            >
              Delete
            </UButton>
          </div>
        </div>
      </div>
    </template>
  </USlideover>
</template>
