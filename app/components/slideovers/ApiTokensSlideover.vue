<script setup lang="ts">
import { AlertModal, ApiTokenRevealModal } from '#components'

/**
 * Your own API tokens. Personal, so this drawer is not scoped to the project you
 * happen to be viewing — a token can reach several, and it keeps working while
 * you switch projects.
 *
 * A token can only name projects you are on the team of, so the picker offers
 * exactly those. The reach is re-checked on every request against your live
 * membership, which is why a row can go dead without being revoked: leave the
 * team and the token stops working, but the record stays, and the list says
 * *where* it stopped rather than just that it did.
 *
 * The other direction — "who can reach this project" — is the project's own
 * question and lives with the project, not here.
 *
 * No plaintext lives in this component. A new token goes straight into
 * `ApiTokenRevealModal`, whose Dismiss is the only way out, so closing this
 * drawer can never lose a token that has not been copied yet.
 */

type ApiTokenProject = {
  id: number
  name: string
  /** False once its owner leaves the team behind it. */
  active: boolean
}

type ApiTokenRow = {
  id: number
  name: string
  prefix: string
  scope: string
  createdAt: string
  revokedAt: string | null
  lastUsedAt: string | null
  projects: ApiTokenProject[]
}

const store = useProjectStore()
const { $dayjs } = useNuxtApp()
const overlay = useOverlay()
const confirmModal = overlay.create(AlertModal)
const revealModal = overlay.create(ApiTokenRevealModal)

const open = ref(false)
const tokens = ref<ApiTokenRow[]>([])
const loadingTokens = ref(false)
const newName = ref('')
const newScope = ref('read')
const newProjects = ref<number[]>([])
const creating = ref(false)
const revokingId = ref<number | null>(null)
const purgingId = ref<number | null>(null)

/**
 * Read is the default, matching the server. The two labels are kept in the same
 * grammatical shape so they read as two settings of one thing — a noun-ish
 * "Read-only" next to a verb-ish "Can write" reads as two unrelated statements.
 *
 * "Read & write" rather than anything implying symmetry of power: the write half
 * is deliberately narrow (pages and tags, for import), which is what the help
 * line under the picker is for. A label cannot carry that caveat; the sentence
 * can.
 */
const scopeItems = [
  { label: 'Read-only', value: 'read' },
  { label: 'Read & write', value: 'write' },
]

function scopeLabel(scope: string) {
  return scope === 'write' ? 'Read & write' : 'Read-only'
}

/**
 * Only projects you are on the team of, so the picker cannot offer something the
 * server would refuse. Prefixed with the team because project names are not
 * unique — two teams can each have a "Web".
 */
const projectItems = computed(() =>
  store.projects
    .map((project) => {
      const team = store.teams.find((t) => String(t.id) === String(project.teamId))
      return {
        label: team ? `${team.name} · ${project.name}` : project.name,
        value: Number(project.id),
      }
    })
    .sort((a, b) => a.label.localeCompare(b.label))
)

/**
 * The one summary a card needs: whether the token can do anything at all.
 *
 * A partly-dead token needs no sentence — the chips carry it, each dead one
 * marked. Only the cases where the answer is "nothing" are worth words, because
 * that is when a reader has to act.
 */
function deadSummary(row: ApiTokenRow): string | null {
  if (row.revokedAt) return null
  if (!row.projects.length) return 'Its projects were deleted, so it can do nothing.'
  if (!row.projects.some((project) => project.active)) {
    return 'You have left the team behind every project here, so it can do nothing.'
  }
  return null
}

async function loadTokens() {
  loadingTokens.value = true
  try {
    tokens.value = (await useApi<ApiTokenRow[]>('/api/user/api-tokens')) ?? []
  } finally {
    loadingTokens.value = false
  }
}

async function createToken() {
  const name = newName.value.trim()
  if (!name || newProjects.value.length === 0) return
  creating.value = true
  try {
    const created = await useApi<ApiTokenRow & { token: string }>(
      '/api/user/api-tokens',
      {
        method: 'POST',
        body: { name, scope: newScope.value, projects: newProjects.value },
      }
    )
    newName.value = ''
    newScope.value = 'read'
    newProjects.value = []
    // Revealed before the list reloads: the plaintext exists only in this one
    // response, so nothing that can fail is allowed to sit between the create
    // and the reveal.
    revealModal.open({
      token: created.token,
      name: created.name,
      scope: created.scope,
      onDismiss: () => revealModal.patch({ token: '' }),
    })
    await loadTokens()
  } finally {
    creating.value = false
  }
}

async function revokeToken(row: ApiTokenRow) {
  revokingId.value = row.id
  try {
    await useApi(`/api/user/api-tokens/${row.id}`, { method: 'DELETE' })
    await loadTokens()
  } finally {
    revokingId.value = null
  }
}

function confirmPurgeToken(row: ApiTokenRow) {
  confirmModal.open({
    mode: 'delete',
    title: 'Delete token',
    // The row is the only record that this credential ever existed, so the copy
    // has to say that plainly instead of implying a reversible disable.
    message: `Delete “${row.name}” permanently? This erases the record itself — its creation date and usage history go with it. Any client still holding the token is already locked out.`,
    okText: 'Delete',
    onOk: async (_mode, { close }) => {
      purgingId.value = row.id
      try {
        await useApi(`/api/user/api-tokens/${row.id}/purge`, { method: 'DELETE' })
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

/** Loaded on open rather than on mount, so the list is fresh each time. */
watch(open, (isOpen) => {
  if (isOpen) loadTokens()
})
</script>

<template>
  <USlideover
    v-model:open="open"
    title="API tokens"
    description="Personal credentials that reach the projects you pick."
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
        <div class="flex flex-col gap-2">
          <div class="flex items-center gap-2">
            <UInput
              v-model="newName"
              class="flex-1"
              size="sm"
              placeholder="What is it for, e.g. Figma plugin"
              @keyup.enter="createToken"
            />
            <USelect
              v-model="newScope"
              :items="scopeItems"
              size="sm"
              class="w-36"
            />
          </div>
          <USelectMenu
            v-model="newProjects"
            :items="projectItems"
            multiple
            value-key="value"
            placeholder="Which projects may it reach?"
            class="w-full"
          />
          <p
            v-if="newScope === 'write'"
            class="text-xs text-warning"
          >
            A read &amp; write token can also create and update pages and tags in
            those projects — it still cannot change translations.
          </p>
          <UButton
            class="justify-center"
            size="sm"
            :loading="creating"
            :disabled="!newName.trim() || newProjects.length === 0"
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
          No tokens yet. Create one to let a consumer read published copy, or to
          import frames from a design tool.
        </div>
        <div v-else class="flex flex-col gap-2">
          <article
            v-for="row in tokens"
            :key="row.id"
            class="rounded-lg border border-default p-3 flex flex-col gap-2"
          >
            <!-- Identity, then whatever is true of the whole token. -->
            <div class="flex items-start justify-between gap-3">
              <div class="min-w-0 flex flex-col gap-0.5">
                <div class="flex flex-wrap items-center gap-2">
                  <span class="text-sm font-medium break-words">{{ row.name }}</span>
                  <UBadge
                    size="sm"
                    :color="row.scope === 'write' ? 'warning' : 'neutral'"
                    variant="subtle"
                  >
                    {{ scopeLabel(row.scope) }}
                  </UBadge>
                  <UBadge
                    v-if="row.revokedAt"
                    size="sm"
                    color="error"
                    variant="subtle"
                  >
                    Revoked
                  </UBadge>
                </div>
                <!--
                  Shown because it is the only way to tell two tokens with the
                  same name apart: it is the head of the plaintext, which is what
                  is sitting in whatever tool you configured.
                -->
                <code class="text-xs text-muted">{{ row.prefix }}…</code>
              </div>
              <UButton
                v-if="!row.revokedAt"
                class="shrink-0"
                size="xs"
                color="error"
                variant="subtle"
                :loading="revokingId === row.id"
                @click="revokeToken(row)"
              >
                Revoke
              </UButton>
              <UButton
                v-else
                class="shrink-0"
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

            <!-- Where it works. A project whose team you have left keeps its name. -->
            <div class="flex flex-col gap-1">
              <div class="flex flex-wrap items-center gap-1">
                <span class="mr-1 text-xs text-muted">Reaches</span>
                <UBadge
                  v-for="project in row.projects"
                  :key="project.id"
                  size="sm"
                  variant="outline"
                  :color="project.active ? 'neutral' : 'error'"
                  :icon="project.active ? undefined : 'i-lucide:unlink'"
                >
                  {{ project.name }}
                </UBadge>
                <span
                  v-if="!row.projects.length"
                  class="text-xs text-muted"
                >
                  nothing
                </span>
              </div>
              <span
                v-if="deadSummary(row)"
                class="text-xs text-warning"
              >
                {{ deadSummary(row) }}
              </span>
            </div>

            <span class="text-xs text-muted">
              Created {{ formatDate(row.createdAt) }} · Last used
              {{ formatDate(row.lastUsedAt) }}
            </span>
          </article>
        </div>
      </div>
    </template>
  </USlideover>
</template>