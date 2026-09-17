<script setup lang="ts">
import { AlertModal } from '#components'

definePageMeta({
  middleware: ['protected'],
  ssr: false,
})

/**
 * The public API surface, for anyone who consumes it rather than stewards the
 * project. Documentation and examples are visible to every team member; only
 * creating and revoking a token is project configuration, so that half follows
 * `canManageProjectSettings` — the same gate the Releases roster uses.
 */

const { $dayjs } = useNuxtApp()
const toast = useToast()
const overlay = useOverlay()
const confirmModal = overlay.create(AlertModal)

const store = useProjectStore()
const { curProject, curReleases } = storeToRefs(store)

const projectId = computed(() => curProject.value?.id)
const canManage = computed(() => canManageProjectSettings(curProject.value))

type ApiTokenRow = {
  id: number
  name: string
  prefix: string
  createdAt: string
  revokedAt: string | null
  lastUsedAt: string | null
}

const tokens = ref<ApiTokenRow[]>([])
const loadingTokens = ref(false)
const newName = ref('')
const creating = ref(false)
const revokingId = ref<number | null>(null)
const purgingId = ref<number | null>(null)

/** The plaintext, held only until the page is left. Never fetched again. */
const freshToken = ref<string | null>(null)

const baseUrl = computed(() =>
  typeof window === 'undefined' ? '' : window.location.origin
)

const releaseExample = computed(() => curReleases.value[0]?.name ?? 'v1')

function curlExample(path: string) {
  return `curl -H "Authorization: Bearer <token>" \\
  ${baseUrl.value}${path}`
}

const examples = computed(() => [
  {
    title: 'Project metadata',
    description:
      'Locales, fallback, the releases you can filter by, and how many keys are published per locale.',
    code: curlExample(`/api/v1/projects/${projectId.value ?? ':id'}/meta`),
  },
  {
    title: 'One locale',
    description:
      'Flat { key: text } map of published copy. Missing keys stay missing on purpose.',
    code: curlExample(
      `/api/v1/projects/${projectId.value ?? ':id'}/locales/en`
    ),
  },
  {
    title: 'Filtered to a release',
    description:
      'Narrow to the keys labelled with one release. Accepts the id or the name.',
    code: curlExample(
      `/api/v1/projects/${projectId.value ?? ':id'}/locales/en?release=${releaseExample.value}`
    ),
  },
  {
    title: 'Every locale at once',
    description:
      'One round trip for a runtime bundle. Same shape, keyed by locale.',
    code: curlExample(`/api/v1/projects/${projectId.value ?? ':id'}/runtime`),
  },
])

const fetchExample = computed(
  () => `const res = await fetch(
  '${baseUrl.value}/api/v1/projects/${projectId.value ?? ':id'}/locales/en',
  { headers: { Authorization: 'Bearer ' + process.env.LOCALNESS_API_TOKEN } }
)
const messages = await res.json()`
)

async function loadTokens() {
  if (!canManage.value || !validID(projectId.value)) {
    tokens.value = []
    return
  }
  loadingTokens.value = true
  try {
    tokens.value =
      (await useApi<ApiTokenRow[]>(
        `/api/projects/${projectId.value}/api-tokens`
      )) ?? []
  } finally {
    loadingTokens.value = false
  }
}

async function createToken() {
  const name = newName.value.trim()
  if (!name || !validID(projectId.value)) return
  creating.value = true
  try {
    const created = await useApi<ApiTokenRow & { token: string }>(
      `/api/projects/${projectId.value}/api-tokens`,
      { method: 'POST', body: { name } }
    )
    freshToken.value = created.token
    newName.value = ''
    await loadTokens()
  } finally {
    creating.value = false
  }
}

async function revokeToken(row: ApiTokenRow) {
  if (!validID(projectId.value)) return
  revokingId.value = row.id
  try {
    await useApi(
      `/api/projects/${projectId.value}/api-tokens/${row.id}`,
      { method: 'DELETE' }
    )
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
          `/api/projects/${projectId.value}/api-tokens/${row.id}/purge`,
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

async function copy(value: string, label: string) {
  try {
    await navigator.clipboard.writeText(value)
    toast.add({ title: `${label} copied`, color: 'success' })
  } catch {
    toast.add({ title: 'Copy failed', color: 'error' })
  }
}

function formatDate(value: string | null | undefined) {
  if (!value) return 'Never'
  return $dayjs(value).format('YYYY-MM-DD HH:mm')
}

watch(projectId, () => {
  freshToken.value = null
  loadTokens()
})

onMounted(loadTokens)
</script>

<template>
  <div class="size-full overflow-auto">
    <div class="mx-auto max-w-3xl p-6 flex flex-col gap-8">
      <header class="flex flex-col gap-2">
        <h1 class="text-xl font-semibold">API</h1>
        <p class="text-sm text-muted">
          Read-only access to this project's published copy. Drafts are never
          reachable with a token, and versioned by
          <code class="text-xs">release</code> only.
        </p>
      </header>

      <section class="flex flex-col gap-3">
        <h2 class="text-sm font-semibold">Authentication</h2>
        <div
          class="rounded-lg border border-default p-3 flex flex-col gap-2 text-sm"
        >
          <p class="text-muted">
            Send a token as a bearer credential. A token names exactly one
            project, so it cannot read any other.
          </p>
          <pre
            class="rounded bg-elevated/50 p-2 text-xs overflow-x-auto"
          ><code>Authorization: Bearer &lt;token&gt;</code></pre>
          <p class="text-xs text-muted">
            Requests need HTTPS in front of the instance — a token over plain
            HTTP is a credential on the wire.
          </p>
        </div>
      </section>

      <section class="flex flex-col gap-3">
        <h2 class="text-sm font-semibold">Endpoints</h2>
        <div
          v-for="example in examples"
          :key="example.title"
          class="rounded-lg border border-default p-3 flex flex-col gap-2"
        >
          <div class="flex items-start justify-between gap-2">
            <div class="flex flex-col gap-0.5 min-w-0">
              <span class="text-sm font-medium">{{ example.title }}</span>
              <span class="text-xs text-muted">{{ example.description }}</span>
            </div>
            <UButton
              size="xs"
              color="neutral"
              variant="ghost"
              icon="i-lucide:copy"
              @click="copy(example.code, example.title)"
            />
          </div>
          <pre
            class="rounded bg-elevated/50 p-2 text-xs overflow-x-auto"
          ><code>{{ example.code }}</code></pre>
        </div>
      </section>

      <section class="flex flex-col gap-3">
        <div class="flex items-center justify-between">
          <h2 class="text-sm font-semibold">From the browser or Node</h2>
          <UButton
            size="xs"
            color="neutral"
            variant="ghost"
            icon="i-lucide:copy"
            @click="copy(fetchExample, 'Snippet')"
          />
        </div>
        <pre
          class="rounded-lg border border-default bg-elevated/50 p-3 text-xs overflow-x-auto"
        ><code>{{ fetchExample }}</code></pre>
      </section>

      <section class="flex flex-col gap-3">
        <h2 class="text-sm font-semibold">Tokens</h2>

        <div
          v-if="!canManage"
          class="rounded-lg border border-default p-3 text-sm text-muted"
        >
          Only a project steward can create or revoke tokens. The documentation
          above works with any token issued for this project.
        </div>

        <template v-else>
          <div
            v-if="freshToken"
            class="rounded-lg border border-warning/50 bg-warning/10 p-3 flex flex-col gap-2"
          >
            <span class="text-sm font-medium">
              Copy this token now — it is shown once
            </span>
            <div class="flex items-center gap-2">
              <code
                class="flex-1 min-w-0 truncate rounded bg-elevated/60 p-2 text-xs"
                >{{ freshToken }}</code
              >
              <UButton
                size="xs"
                icon="i-lucide:copy"
                @click="copy(freshToken!, 'Token')"
              >
                Copy
              </UButton>
              <UButton
                size="xs"
                color="neutral"
                variant="ghost"
                @click="freshToken = null"
              >
                Dismiss
              </UButton>
            </div>
            <p class="text-xs text-muted">
              The server keeps only a hash. There is no way to show it again.
            </p>
          </div>

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
                  <span class="text-sm font-medium truncate">{{
                    row.name
                  }}</span>
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
                v-else
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
        </template>
      </section>
    </div>
  </div>
</template>
