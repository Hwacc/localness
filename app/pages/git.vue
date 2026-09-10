<script setup lang="ts">
import {
  GitCredentialKind,
  GitSyncConflictStatus,
  GitSyncPullReason,
  GitSyncPushReason,
  TeamRole,
} from '#shared/constants'
import { validID } from '#shared/utils'
import { isHttpsRemoteUrl, normalizeGitHttpsRemote } from '#shared/utils/schemas'

definePageMeta({
  middleware: ['protected'],
  ssr: false,
})

type GitSyncBindingPublic = {
  id: number
  enabled: boolean
  adapter: string
  remoteUrl: string
  branch: string
  product: string
  credentialKind: string
  tokenConfigured: boolean
  lastPulledAt: string | null
  lastPushedAt: string | null
}

type GitSyncStatus = {
  role: string
  configured: boolean
  binding: GitSyncBindingPublic | null
  openConflicts: number
}

type GitSyncConflictRow = {
  id: number
  key: string
  locale: string
  baseText: string
  oursText: string
  theirsText: string
  publishedText: string | null
}

type ThreeWayDecision = 'apply-theirs' | 'keep-ours' | 'align' | 'conflict'

type PullFile = {
  relPath: string
  sha: string
  locale: string | null
  remoteLocale: string
  date: string
  reason: string
}

type PullCandidate = {
  key: string
  locale: string
  baseText: string
  oursText: string
  theirsText: string
  publishedText: string | null
  decision: ThreeWayDecision
}

type PullPreview = {
  previewId: number
  commitSha: string
  expiresAt: string
  files: PullFile[]
  candidates: PullCandidate[]
  counts: Record<ThreeWayDecision, number>
}

type PushCandidate = {
  key: string
  baseText: string
  text: string
  reason: string
  eligible: boolean
}

type PushPreview = {
  previewId: number
  sourceLocale: string
  expiresAt: string
  candidates: PushCandidate[]
  counts: Record<string, number>
}

const { $dayjs } = useNuxtApp()
const toast = useToast()
const projectStore = useProjectStore()
const { curProject } = storeToRefs(projectStore)

const loading = ref(false)
const saving = ref(false)
const discovering = ref(false)
const pulling = ref(false)
const pushing = ref(false)
const resolvingId = ref<number | null>(null)
const showSettings = ref(false)
const editingId = ref<number | null>(null)
const editText = ref('')

const status = ref<GitSyncStatus | null>(null)
const conflicts = ref<GitSyncConflictRow[]>([])
const productItems = ref<{ value: string; label: string }[]>([])

const pullPreview = ref<PullPreview | null>(null)
const pushPreview = ref<PushPreview | null>(null)
const pullFileSel = ref<string[]>([])
const pullKeySel = ref<string[]>([])
const pushKeySel = ref<string[]>([])
const applying = ref(false)
const showSeenFiles = ref(false)
const showFilteredKeys = ref(false)

const form = reactive({
  enabled: true,
  product: '',
  credentialKind: GitCredentialKind.REPO_ACCESS_TOKEN,
  token: '',
  remoteUrl: '',
  branch: 'main',
})

const projectId = computed(() => curProject.value.id)
const isOwner = computed(() => status.value?.role === TeamRole.OWNER)
const configured = computed(() => Boolean(status.value?.configured))
const openCount = computed(
  () => status.value?.openConflicts ?? conflicts.value.length
)

const credentialItems = [
  {
    label: 'Repository Access Token',
    value: GitCredentialKind.REPO_ACCESS_TOKEN,
  },
  {
    label: 'Personal API token',
    value: GitCredentialKind.API_TOKEN,
  },
]

function applyBindingToForm(binding: GitSyncBindingPublic | null) {
  form.enabled = binding?.enabled ?? true
  form.product = binding?.product ?? ''
  form.credentialKind =
    binding?.credentialKind === GitCredentialKind.API_TOKEN
      ? GitCredentialKind.API_TOKEN
      : GitCredentialKind.REPO_ACCESS_TOKEN
  form.token = ''
  form.remoteUrl = binding?.remoteUrl ?? ''
  form.branch = binding?.branch || 'main'
  productItems.value = binding?.product
    ? [{ value: binding.product, label: binding.product }]
    : []
}

const canDiscover = computed(
  () =>
    isHttpsRemoteUrl(form.remoteUrl) &&
    (Boolean(form.token.trim()) ||
      Boolean(status.value?.binding?.tokenConfigured))
)

function applyNormalizedRemoteUrl() {
  const normalized = normalizeGitHttpsRemote(form.remoteUrl)
  if (!normalized) return false
  form.remoteUrl = normalized.remoteUrl
  if (normalized.branch) form.branch = normalized.branch
  return true
}

function formatTime(value: string | null | undefined) {
  if (!value) return 'Never'
  return $dayjs(value).format('YYYY-MM-DD HH:mm')
}

async function loadAll() {
  if (!validID(projectId.value)) {
    status.value = null
    conflicts.value = []
    return
  }
  loading.value = true
  try {
    const next = await useApi<GitSyncStatus>(
      `/api/projects/${projectId.value}/git-sync`
    )
    status.value = next
    applyBindingToForm(next.binding)
    showSettings.value = !next.configured && next.role === TeamRole.OWNER
    if (next.configured) {
      conflicts.value =
        (await useApi<GitSyncConflictRow[]>(
          `/api/projects/${projectId.value}/git-sync/conflicts`
        )) ?? []
    } else {
      conflicts.value = []
    }
  } finally {
    loading.value = false
  }
}

watch(
  () => projectId.value,
  () => {
    loadAll()
  }
)

onMounted(() => {
  loadAll()
})

async function loadProducts() {
  if (!validID(projectId.value)) return
  if (!applyNormalizedRemoteUrl()) {
    toast.add({
      title: 'Remote URL required',
      description:
        'Use an https Git clone URL (…/workspace/repo.git), not a browser page.',
      color: 'warning',
    })
    return
  }
  if (!canDiscover.value) {
    toast.add({
      title: 'Token required',
      description: 'Paste a token to list products from the remote.',
      color: 'warning',
    })
    return
  }
  discovering.value = true
  try {
    const items = await useApi<{ value: string; label: string }[]>(
      `/api/projects/${projectId.value}/git-sync/products`,
      {
        method: 'POST',
        body: {
          remoteUrl: form.remoteUrl,
          branch: form.branch || 'main',
          credentialKind: form.credentialKind,
          token: form.token,
        },
      }
    )
    productItems.value = items ?? []
    if (!productItems.value.some((item) => item.value === form.product)) {
      form.product = productItems.value[0]?.value ?? ''
    }
    if (!productItems.value.length) {
      toast.add({
        title: 'No products found',
        description:
          'No folders with source/ or translated/ were found on that branch.',
        color: 'warning',
      })
    }
  } finally {
    discovering.value = false
  }
}

async function saveBinding() {
  if (!validID(projectId.value)) return
  if (!applyNormalizedRemoteUrl()) {
    toast.add({
      title: 'Remote URL required',
      description:
        'Use an https Git clone URL (…/workspace/repo.git), not a browser page.',
      color: 'warning',
    })
    return
  }
  if (!form.product.trim()) {
    toast.add({
      title: 'Product required',
      description: 'Load products from the remote, then choose one.',
      color: 'warning',
    })
    return
  }
  if (!configured.value && !form.token.trim()) {
    toast.add({
      title: 'Token required',
      description: 'Paste a token to enable Git sync.',
      color: 'warning',
    })
    return
  }
  saving.value = true
  try {
    await useApi(`/api/projects/${projectId.value}/git-sync`, {
      method: 'PUT',
      body: {
        enabled: form.enabled,
        product: form.product,
        credentialKind: form.credentialKind,
        token: form.token,
        remoteUrl: form.remoteUrl,
        branch: form.branch || 'main',
      },
    })
    toast.add({
      title: 'Git sync saved',
      color: 'success',
    })
    await loadAll()
  } finally {
    saving.value = false
  }
}

function candidateId(c: PullCandidate) {
  return `${c.key}\0${c.locale}`
}

/** Decisions that write something. `keep-ours` is a no-op, so it is shown but unchecked. */
function isPullActionable(c: PullCandidate) {
  return c.decision !== 'keep-ours'
}

const pullVisibleFiles = computed(() =>
  (pullPreview.value?.files ?? []).filter(
    (f) => showSeenFiles.value || f.reason !== GitSyncPullReason.SEEN_FILE
  )
)

const pushVisibleCandidates = computed(() =>
  (pushPreview.value?.candidates ?? []).filter(
    (c) => showFilteredKeys.value || c.eligible
  )
)

const pushReasonLabel: Record<string, string> = {
  [GitSyncPushReason.NEW_KEY]: 'New key',
  [GitSyncPushReason.CHANGED]: 'Changed',
  [GitSyncPushReason.UNCHANGED]: 'Unchanged since last push',
  [GitSyncPushReason.NOT_PUBLISHED]: 'No published source text',
  [GitSyncPushReason.DRAFT_KEY]: 'Auto draft key',
}

const pullReasonLabel: Record<string, string> = {
  [GitSyncPullReason.NEW_FILE]: 'New file',
  [GitSyncPullReason.CHANGED_FILE]: 'Content changed',
  [GitSyncPullReason.SEEN_FILE]: 'Already pulled',
}

const decisionLabel: Record<ThreeWayDecision, string> = {
  'apply-theirs': 'Apply Git text',
  'keep-ours': 'Keep platform draft',
  align: 'Align base only',
  conflict: 'Conflict',
}

type SelectionName = 'pullFile' | 'pullKey' | 'pushKey'

const selectionRefs: Record<SelectionName, Ref<string[]>> = {
  pullFile: pullFileSel,
  pullKey: pullKeySel,
  pushKey: pushKeySel,
}

/**
 * Templates unwrap refs, so the list is addressed by name rather than passed
 * in. Nuxt UI checkboxes emit `boolean | 'indeterminate'`.
 */
function isSelected(name: SelectionName, id: string) {
  return selectionRefs[name].value.includes(id)
}

function setSelected(
  name: SelectionName,
  id: string,
  on: boolean | 'indeterminate'
) {
  const list = selectionRefs[name]
  const has = list.value.includes(id)
  if (on === true && !has) list.value = [...list.value, id]
  else if (on !== true && has)
    list.value = list.value.filter((item) => item !== id)
}

async function startPull() {
  if (!validID(projectId.value)) return
  pulling.value = true
  try {
    const preview = await useApi<PullPreview>(
      `/api/projects/${projectId.value}/git-sync/pull/preview`,
      { method: 'POST' }
    )
    if (!preview) return
    pullPreview.value = preview
    pushPreview.value = null
    // Default proposal: every new/changed file, every decision that writes.
    pullFileSel.value = preview.files
      .filter((f) => f.reason !== GitSyncPullReason.SEEN_FILE)
      .map((f) => f.relPath)
    pullKeySel.value = preview.candidates
      .filter(isPullActionable)
      .map(candidateId)
    showSeenFiles.value = false
    if (!preview.candidates.length) {
      toast.add({
        title: 'Nothing new to pull',
        description: 'No new or changed batch files on the remote.',
        color: 'neutral',
      })
    }
  } finally {
    pulling.value = false
  }
}

async function confirmPull() {
  if (!validID(projectId.value) || !pullPreview.value) return
  applying.value = true
  try {
    const result = await useApi<{
      applied: number
      aligned: number
      kept: number
      conflicts: number
      files: number
    }>(`/api/projects/${projectId.value}/git-sync/pull/apply`, {
      method: 'POST',
      body: {
        previewId: pullPreview.value.previewId,
        selectedFiles: pullFileSel.value,
        selectedKeys: pullKeySel.value,
      },
    })
    toast.add({
      title: 'Pull finished',
      description: `Applied ${result?.applied ?? 0}, kept ${result?.kept ?? 0}, conflicts ${result?.conflicts ?? 0}, files ${result?.files ?? 0}`,
      color: 'success',
    })
    pullPreview.value = null
    await loadAll()
  } finally {
    applying.value = false
  }
}

async function startPush() {
  if (!validID(projectId.value)) return
  pushing.value = true
  try {
    const preview = await useApi<PushPreview>(
      `/api/projects/${projectId.value}/git-sync/push/preview`,
      { method: 'POST' }
    )
    if (!preview) return
    pushPreview.value = preview
    pullPreview.value = null
    pushKeySel.value = preview.candidates
      .filter((c) => c.eligible)
      .map((c) => c.key)
    // Nothing eligible: open the full list so the reason is visible instead
    // of showing an empty panel.
    showFilteredKeys.value = pushKeySel.value.length === 0
  } finally {
    pushing.value = false
  }
}

async function confirmPush() {
  if (!validID(projectId.value) || !pushPreview.value) return
  applying.value = true
  try {
    const result = await useApi<{
      filename: string
      count: number
      pushed: boolean
      skipped: { key: string; reason: string }[]
    }>(`/api/projects/${projectId.value}/git-sync/push/apply`, {
      method: 'POST',
      body: {
        previewId: pushPreview.value.previewId,
        selectedKeys: pushKeySel.value,
      },
    })
    const skipped = result?.skipped?.length ?? 0
    toast.add({
      title: result?.pushed ? 'Push finished' : 'Nothing to push',
      description: result?.filename
        ? `${result.count} keys → ${result.filename}${skipped ? ` · ${skipped} skipped` : ''}`
        : undefined,
      color: 'success',
    })
    pushPreview.value = null
    await loadAll()
  } finally {
    applying.value = false
  }
}

function cancelPreview() {
  pullPreview.value = null
  pushPreview.value = null
}

async function resolve(
  conflict: GitSyncConflictRow,
  action:
    | typeof GitSyncConflictStatus.OURS
    | typeof GitSyncConflictStatus.THEIRS
    | typeof GitSyncConflictStatus.MERGED,
  text?: string
) {
  if (!validID(projectId.value)) return
  resolvingId.value = conflict.id
  try {
    await useApi(
      `/api/projects/${projectId.value}/git-sync/conflicts/${conflict.id}/resolve`,
      {
        method: 'POST',
        body: { action, text },
      }
    )
    editingId.value = null
    await loadAll()
  } finally {
    resolvingId.value = null
  }
}

function startEdit(conflict: GitSyncConflictRow) {
  editingId.value = conflict.id
  editText.value = conflict.oursText
}
</script>

<template>
  <div class="h-full min-w-0 overflow-auto bg-muted">
    <header class="shrink-0 px-6 py-5 bg-default border-b border-default">
      <h1 class="text-xl font-semibold tracking-tight">Git sync</h1>
      <p class="mt-1 text-sm text-muted">
        Pull Git copy into drafts. Push published source strings. Resolve
        conflicts here — not on Translations.
      </p>
    </header>

    <div class="p-6 flex flex-col gap-6 max-w-5xl">
      <UAlert
        v-if="!validID(projectId)"
        color="neutral"
        variant="subtle"
        title="Select a project"
        description="Pick a project in the workspace bar to configure Git sync."
      />

      <div
        v-else-if="loading && !status"
        class="text-sm text-muted"
      >
        Loading…
      </div>

      <template v-else-if="status && !configured">
        <UAlert
          v-if="!isOwner"
          color="warning"
          variant="subtle"
          title="Git sync is not configured"
          description="Contact the project owner to configure Git sync."
        />

        <div
          v-else
          class="rounded-xl border border-default bg-default p-5 flex flex-col gap-4"
        >
          <h2 class="font-semibold">Set up Git sync</h2>
          <p class="text-sm text-muted">
            Fill the remote URL and token, then load products from that
            repository. Git HTTPS usernames are filled by the server
            (<code>x-token-auth</code> for a repository Access Token,
            <code>x-bitbucket-api-token-auth</code> for a personal API token).
            Create a repo token under repository Settings → Security → Access
            tokens (Read + Write). Create a personal token at Atlassian with
            Bitbucket
            <code>read:repository:bitbucket</code> and
            <code>write:repository:bitbucket</code>. Do not use App Passwords.
          </p>
          <UFormField label="Credential" name="credentialKind">
            <USelect
              v-model="form.credentialKind"
              class="w-full"
              :items="credentialItems"
            />
          </UFormField>
          <UFormField label="Token" name="token">
            <UInput
              v-model="form.token"
              type="password"
              autocomplete="off"
              class="w-full"
              placeholder="Paste token (never shown again)"
            />
          </UFormField>
          <UFormField label="Remote URL" name="remoteUrl">
            <UInput
              v-model="form.remoteUrl"
              class="w-full"
              placeholder="https://bitbucket.org/workspace/repo.git"
              @blur="applyNormalizedRemoteUrl"
            />
            <template #help>
              Git clone HTTPS URL ending in .git. A Bitbucket /src/… browser
              page is converted automatically.
            </template>
          </UFormField>
          <UFormField label="Branch" name="branch">
            <UInput v-model="form.branch" class="w-full" />
          </UFormField>
          <UFormField label="Product" name="product">
            <div class="flex flex-col gap-2 sm:flex-row sm:items-center">
              <USelect
                v-model="form.product"
                class="w-full"
                :disabled="!productItems.length"
                placeholder="Load products from the remote"
                :items="productItems"
              />
              <UButton
                class="shrink-0"
                color="neutral"
                :loading="discovering"
                :disabled="!canDiscover"
                @click="loadProducts"
              >
                Load products
              </UButton>
            </div>
            <p
              v-if="isHttpsRemoteUrl(form.remoteUrl) && !canDiscover"
              class="text-xs text-muted"
            >
              Paste a token to enable Load products. Listing products clones
              the remote.
            </p>
          </UFormField>
          <div>
            <UButton
              :loading="saving"
              color="primary"
              @click="saveBinding"
            >
              Save
            </UButton>
          </div>
        </div>
      </template>

      <template v-else-if="status && configured">
        <div
          class="rounded-xl border border-default bg-default p-5 flex flex-col gap-4"
        >
          <div class="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h2 class="font-semibold">
                {{ status.binding?.product }}
              </h2>
              <p class="mt-1 text-sm text-muted">
                Last pull {{ formatTime(status.binding?.lastPulledAt) }} ·
                Last push {{ formatTime(status.binding?.lastPushedAt) }}
              </p>
              <p
                v-if="openCount > 0"
                class="mt-1 text-sm text-amber-400"
              >
                {{ openCount }} open conflict(s). Push is disabled until they
                are resolved.
              </p>
            </div>
            <div class="flex flex-wrap items-center gap-2">
              <UButton
                :loading="pulling"
                color="primary"
                icon="i-lucide:arrow-down-to-line"
                @click="startPull"
              >
                Pull…
              </UButton>
              <UButton
                :loading="pushing"
                :disabled="openCount > 0"
                color="neutral"
                icon="i-lucide:arrow-up-to-line"
                @click="startPush"
              >
                Push…
              </UButton>
              <UButton
                v-if="isOwner"
                color="neutral"
                variant="ghost"
                @click="showSettings = !showSettings"
              >
                Settings
              </UButton>
            </div>
          </div>

          <div
            v-if="isOwner && showSettings"
            class="pt-3 border-t border-default flex flex-col gap-4"
          >
            <UFormField label="Credential" name="credentialKind">
              <USelect
                v-model="form.credentialKind"
                class="w-full"
                :items="credentialItems"
              />
            </UFormField>
            <UFormField
              label="Rotate token (leave blank to keep)"
              name="token"
            >
              <UInput
                v-model="form.token"
                type="password"
                autocomplete="off"
                class="w-full"
              />
            </UFormField>
            <UFormField label="Remote URL" name="remoteUrl">
              <UInput
                v-model="form.remoteUrl"
                class="w-full"
                placeholder="https://bitbucket.org/workspace/repo.git"
                @blur="applyNormalizedRemoteUrl"
              />
            </UFormField>
            <UFormField label="Branch" name="branch">
              <UInput v-model="form.branch" class="w-full" />
            </UFormField>
            <UFormField label="Product" name="product">
              <div class="flex flex-col gap-2 sm:flex-row sm:items-center">
                <USelect
                  v-model="form.product"
                  class="w-full"
                  :disabled="!productItems.length"
                  placeholder="Load products from the remote"
                  :items="productItems"
                />
                <UButton
                  class="shrink-0"
                  color="neutral"
                  :loading="discovering"
                  :disabled="!canDiscover"
                  @click="loadProducts"
                >
                  Load products
                </UButton>
              </div>
            </UFormField>
            <div>
              <UButton :loading="saving" @click="saveBinding">
                Save settings
              </UButton>
            </div>
          </div>
        </div>

        <div
          v-if="pullPreview"
          class="rounded-xl border border-primary/40 bg-default p-5 flex flex-col gap-4"
        >
          <div class="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h2 class="font-semibold">Review pull</h2>
              <p class="mt-1 text-sm text-muted">
                {{ pullFileSel.length }} of
                {{ pullPreview.files.length }} file(s)
                · {{ pullKeySel.length }} of
                {{ pullPreview.candidates.length }} change(s) selected.
                Nothing is written until you confirm.
              </p>
              <p class="mt-1 text-xs text-muted">
                Remote {{ pullPreview.commitSha.slice(0, 8) }} · expires
                {{ formatTime(pullPreview.expiresAt) }}
              </p>
            </div>
            <div class="flex items-center gap-2">
              <UButton
                color="neutral"
                variant="ghost"
                :disabled="applying"
                @click="cancelPreview"
              >
                Cancel
              </UButton>
              <UButton
                color="primary"
                :loading="applying"
                :disabled="!pullKeySel.length"
                @click="confirmPull"
              >
                Apply pull
              </UButton>
            </div>
          </div>

          <div class="flex flex-col gap-2">
            <div class="flex items-center justify-between gap-2">
              <h3 class="text-sm font-medium">Batch files</h3>
              <UCheckbox
                v-model="showSeenFiles"
                label="Show already pulled"
              />
            </div>
            <p v-if="!pullVisibleFiles.length" class="text-sm text-muted">
              No files to show.
            </p>
            <div
              v-for="file in pullVisibleFiles"
              :key="file.relPath"
              class="flex items-center gap-3 rounded-lg bg-muted px-3 py-2"
            >
              <UCheckbox
                :model-value="isSelected('pullFile', file.relPath)"
                @update:model-value="
                  setSelected('pullFile', file.relPath, $event)
                "
              />
              <div class="min-w-0 flex-1">
                <p class="truncate text-sm">{{ file.relPath }}</p>
                <p class="text-xs text-muted">
                  {{ pullReasonLabel[file.reason] ?? file.reason }} ·
                  {{ file.locale ?? `unmapped (${file.remoteLocale})` }}
                </p>
              </div>
            </div>
          </div>

          <div class="flex flex-col gap-2">
            <h3 class="text-sm font-medium">Changes</h3>
            <p v-if="!pullPreview.candidates.length" class="text-sm text-muted">
              No key changes in the selected files.
            </p>
            <div
              v-for="c in pullPreview.candidates"
              :key="candidateId(c)"
              class="flex items-start gap-3 rounded-lg bg-muted px-3 py-2"
            >
              <UCheckbox
                class="mt-1"
                :model-value="isSelected('pullKey', candidateId(c))"
                @update:model-value="
                  setSelected('pullKey', candidateId(c), $event)
                "
              />
              <div class="min-w-0 flex-1">
                <div class="flex items-baseline justify-between gap-2">
                  <p class="truncate text-sm font-medium">{{ c.key }}</p>
                  <p class="shrink-0 text-xs text-muted">{{ c.locale }}</p>
                </div>
                <p class="text-xs text-muted">
                  {{ decisionLabel[c.decision] }}
                </p>
                <p class="mt-1 text-sm whitespace-pre-wrap break-words">
                  {{ c.theirsText }}
                </p>
                <p
                  v-if="c.oursText && c.oursText !== c.theirsText"
                  class="text-xs text-muted whitespace-pre-wrap break-words"
                >
                  Platform draft: {{ c.oursText }}
                </p>
              </div>
            </div>
          </div>
        </div>

        <div
          v-if="pushPreview"
          class="rounded-xl border border-primary/40 bg-default p-5 flex flex-col gap-4"
        >
          <div class="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h2 class="font-semibold">Review push</h2>
              <p class="mt-1 text-sm text-muted">
                {{ pushKeySel.length }} of
                {{ pushPreview.candidates.length }} source key(s) selected
                ({{ pushPreview.sourceLocale }}). Nothing is committed until
                you confirm.
              </p>
              <p class="mt-1 text-xs text-muted">
                Expires {{ formatTime(pushPreview.expiresAt) }}
              </p>
            </div>
            <div class="flex items-center gap-2">
              <UButton
                color="neutral"
                variant="ghost"
                :disabled="applying"
                @click="cancelPreview"
              >
                Cancel
              </UButton>
              <UButton
                color="primary"
                :loading="applying"
                :disabled="!pushKeySel.length"
                @click="confirmPush"
              >
                Commit push
              </UButton>
            </div>
          </div>

          <div class="flex items-center justify-between gap-2">
            <h3 class="text-sm font-medium">Keys</h3>
            <UCheckbox
              v-model="showFilteredKeys"
              label="Show filtered out"
            />
          </div>
          <p v-if="!pushVisibleCandidates.length" class="text-sm text-muted">
            No keys to show.
          </p>
          <div
            v-for="c in pushVisibleCandidates"
            :key="c.key"
            class="flex items-start gap-3 rounded-lg bg-muted px-3 py-2"
          >
            <UCheckbox
              class="mt-1"
              :model-value="isSelected('pushKey', c.key)"
              @update:model-value="setSelected('pushKey', c.key, $event)"
            />
            <div class="min-w-0 flex-1">
              <div class="flex items-baseline justify-between gap-2">
                <p class="truncate text-sm font-medium">{{ c.key }}</p>
                <p class="shrink-0 text-xs text-muted">
                  {{ pushReasonLabel[c.reason] ?? c.reason }}
                </p>
              </div>
              <p class="mt-1 text-sm whitespace-pre-wrap break-words">
                {{ c.text || '—' }}
              </p>
              <p
                v-if="c.baseText && c.baseText !== c.text"
                class="text-xs text-muted whitespace-pre-wrap break-words"
              >
                Last pushed: {{ c.baseText }}
              </p>
            </div>
          </div>
        </div>

        <div class="flex flex-col gap-3">
          <h2 class="font-semibold">Conflicts</h2>
          <p v-if="!conflicts.length" class="text-sm text-muted">
            No open conflicts.
          </p>
          <div
            v-for="conflict in conflicts"
            :key="conflict.id"
            class="rounded-xl border border-default bg-default p-4 flex flex-col gap-3"
          >
            <div class="flex items-baseline justify-between gap-2">
              <p class="font-medium truncate">{{ conflict.key }}</p>
              <p class="text-xs text-muted shrink-0">{{ conflict.locale }}</p>
            </div>
            <div class="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div class="rounded-lg bg-muted p-3">
                <p class="text-xs font-medium mb-1">Git (theirs)</p>
                <p class="text-sm whitespace-pre-wrap break-words">
                  {{ conflict.theirsText }}
                </p>
              </div>
              <div class="rounded-lg bg-muted p-3">
                <p class="text-xs font-medium mb-1">Platform draft (ours)</p>
                <p class="text-sm whitespace-pre-wrap break-words">
                  {{ conflict.oursText }}
                </p>
              </div>
            </div>
            <p class="text-xs text-muted whitespace-pre-wrap break-words">
              Last sync (base): {{ conflict.baseText || '—' }}
            </p>
            <p
              v-if="conflict.publishedText"
              class="text-xs text-muted whitespace-pre-wrap break-words"
            >
              Published (reference): {{ conflict.publishedText }}
            </p>
            <UTextarea
              v-if="editingId === conflict.id"
              v-model="editText"
              class="w-full"
              :rows="4"
            />
            <div class="flex flex-wrap gap-2">
              <UButton
                size="sm"
                :loading="resolvingId === conflict.id"
                @click="resolve(conflict, GitSyncConflictStatus.THEIRS)"
              >
                Use Git
              </UButton>
              <UButton
                size="sm"
                color="neutral"
                :loading="resolvingId === conflict.id"
                @click="resolve(conflict, GitSyncConflictStatus.OURS)"
              >
                Use platform
              </UButton>
              <UButton
                v-if="editingId !== conflict.id"
                size="sm"
                color="neutral"
                variant="ghost"
                @click="startEdit(conflict)"
              >
                Edit
              </UButton>
              <UButton
                v-else
                size="sm"
                color="primary"
                :loading="resolvingId === conflict.id"
                @click="
                  resolve(
                    conflict,
                    GitSyncConflictStatus.MERGED,
                    editText
                  )
                "
              >
                Save edit
              </UButton>
            </div>
          </div>
        </div>
      </template>
    </div>
  </div>
</template>
