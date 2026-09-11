<script setup lang="ts">
import type { TableColumn } from '@nuxt/ui'
import {
  GitCredentialKind,
  GitSyncConflictStatus,
  GitSyncPullReason,
  GitSyncPushReason,
  TeamRole,
} from '#shared/constants'
import { formatI18nKeyDisplay, validID } from '#shared/utils'
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
  relPath?: string
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
  theirsText: string
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
const pullQuery = ref('')
const pushQuery = ref('')
const pullDecisionFilter = ref<ThreeWayDecision | 'all'>('all')
const pullExpanded = ref<Record<string, boolean>>({})
const pushExpanded = ref<Record<string, boolean>>({})

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
const pullOpenConflicts = computed(
  () =>
    pullPreview.value?.candidates.filter((c) => c.decision === 'conflict')
      .length ?? 0
)
const pullCanConfirm = computed(() => {
  if (!pullPreview.value || pullOpenConflicts.value > 0) return false
  return pullKeySel.value.length > 0
})

const pushCanConfirm = computed(() => {
  if (!pushPreview.value || !pushKeySel.value.length) return false
  return (pushPreview.value.counts.conflict ?? 0) === 0
})

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

/** Only Git-ahead rows are applied. Conflicts are cards, not checkboxes. */
function isPullActionable(c: PullCandidate) {
  return c.decision === 'apply-theirs'
}

function isPushRowSelectable(c: PushCandidate) {
  return (
    c.eligible || c.reason === GitSyncPushReason.REMOTE_CHANGED
  )
}

const pullVisibleFiles = computed(() =>
  (pullPreview.value?.files ?? []).filter(
    (f) => showSeenFiles.value || f.reason !== GitSyncPullReason.SEEN_FILE
  )
)

const pullTableRows = computed(() => {
  const q = pullQuery.value.trim().toLowerCase()
  return (pullPreview.value?.candidates ?? []).filter((c) => {
    if (c.relPath && !pullFileSel.value.includes(c.relPath)) return false
    if (
      pullDecisionFilter.value !== 'all' &&
      c.decision !== pullDecisionFilter.value
    ) {
      return false
    }
    if (!q) return true
    return (
      c.key.toLowerCase().includes(q) ||
      c.theirsText.toLowerCase().includes(q) ||
      c.oursText.toLowerCase().includes(q)
    )
  })
})

const pushTableRows = computed(() => {
  const q = pushQuery.value.trim().toLowerCase()
  return (pushPreview.value?.candidates ?? []).filter((c) => {
    if (!showFilteredKeys.value && !c.eligible) {
      if (
        c.reason !== GitSyncPushReason.REMOTE_CHANGED &&
        c.reason !== GitSyncPushReason.CONFLICT
      ) {
        return false
      }
    }
    if (!q) return true
    return (
      c.key.toLowerCase().includes(q) ||
      c.text.toLowerCase().includes(q) ||
      c.baseText.toLowerCase().includes(q) ||
      (c.theirsText ?? '').toLowerCase().includes(q)
    )
  })
})

const pullDecisionItems = [
  { label: 'All decisions', value: 'all' },
  { label: 'Apply Git text', value: 'apply-theirs' },
  { label: 'Keep platform draft', value: 'keep-ours' },
  { label: 'Align base only', value: 'align' },
  { label: 'Conflict', value: 'conflict' },
]

const pullColumns: TableColumn<PullCandidate>[] = [
  { id: 'select', header: '', enableSorting: false },
  { id: 'key', accessorKey: 'key', header: 'Key' },
  { id: 'locale', accessorKey: 'locale', header: 'Locale' },
  { id: 'decision', accessorKey: 'decision', header: 'Reason' },
  { id: 'text', header: 'Text' },
  { id: 'expand', header: '', enableSorting: false },
]

const pushColumns: TableColumn<PushCandidate>[] = [
  { id: 'select', header: '', enableSorting: false },
  { id: 'key', accessorKey: 'key', header: 'Key' },
  { id: 'reason', accessorKey: 'reason', header: 'Reason' },
  { id: 'text', header: 'Text' },
  { id: 'expand', header: '', enableSorting: false },
]

const pushReasonLabel: Record<string, string> = {
  [GitSyncPushReason.NEW_KEY]: 'New key',
  [GitSyncPushReason.CHANGED]: 'Changed',
  [GitSyncPushReason.UNCHANGED]: 'Unchanged since last push',
  [GitSyncPushReason.NOT_PUBLISHED]: 'No published source text',
  [GitSyncPushReason.DRAFT_KEY]: 'Auto draft key',
  [GitSyncPushReason.REMOTE_CHANGED]: 'Git is ahead — check to overwrite',
  [GitSyncPushReason.CONFLICT]: 'Conflict with Git source',
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

function setPullFileSelected(relPath: string, on: boolean | 'indeterminate') {
  setSelected('pullFile', relPath, on)
  const fromFile = (pullPreview.value?.candidates ?? []).filter(
    (c) => c.relPath === relPath
  )
  if (on === true) {
    const add = fromFile.filter(isPullActionable).map(candidateId)
    pullKeySel.value = [...new Set([...pullKeySel.value, ...add])]
    return
  }
  const drop = new Set(fromFile.map(candidateId))
  pullKeySel.value = pullKeySel.value.filter((id) => !drop.has(id))
}

function selectVisiblePull(on: boolean) {
  const ids = pullTableRows.value.filter(isPullActionable).map(candidateId)
  if (on) {
    pullKeySel.value = [...new Set([...pullKeySel.value, ...ids])]
    return
  }
  const drop = new Set(ids)
  pullKeySel.value = pullKeySel.value.filter((id) => !drop.has(id))
}

function selectVisiblePush(on: boolean) {
  const ids = pushTableRows.value.filter((c) => c.eligible).map((c) => c.key)
  if (on) {
    pushKeySel.value = [...new Set([...pushKeySel.value, ...ids])]
    return
  }
  const drop = new Set(ids)
  pushKeySel.value = pushKeySel.value.filter((id) => !drop.has(id))
}

function pullHeaderChecked(): boolean | 'indeterminate' {
  const ids = pullTableRows.value.filter(isPullActionable).map(candidateId)
  if (!ids.length) return false
  const n = ids.filter((id) => pullKeySel.value.includes(id)).length
  if (n === 0) return false
  if (n === ids.length) return true
  return 'indeterminate'
}

function pushHeaderChecked(): boolean | 'indeterminate' {
  const ids = pushTableRows.value.filter((c) => c.eligible).map((c) => c.key)
  if (!ids.length) return false
  const n = ids.filter((id) => pushKeySel.value.includes(id)).length
  if (n === 0) return false
  if (n === ids.length) return true
  return 'indeterminate'
}

function decisionColor(
  decision: ThreeWayDecision
): 'primary' | 'neutral' | 'warning' {
  switch (decision) {
    case 'apply-theirs':
      return 'primary'
    case 'keep-ours':
      return 'neutral'
    case 'align':
      return 'neutral'
    case 'conflict':
      return 'warning'
    default: {
      const _exhaustive: never = decision
      return _exhaustive
    }
  }
}

function pushReasonColor(
  reason: string
): 'primary' | 'neutral' | 'warning' {
  switch (reason) {
    case GitSyncPushReason.NEW_KEY:
    case GitSyncPushReason.CHANGED:
      return 'primary'
    case GitSyncPushReason.REMOTE_CHANGED:
    case GitSyncPushReason.CONFLICT:
      return 'warning'
    case GitSyncPushReason.UNCHANGED:
    case GitSyncPushReason.NOT_PUBLISHED:
    case GitSyncPushReason.DRAFT_KEY:
      return 'neutral'
    default:
      return 'neutral'
  }
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
    const needsSeen = new Set(
      preview.candidates
        .filter((c) => c.decision === 'apply-theirs' || c.decision === 'conflict')
        .map((c) => c.relPath)
        .filter(Boolean)
    )
    pullFileSel.value = preview.files
      .filter(
        (f) =>
          f.reason !== GitSyncPullReason.SEEN_FILE || needsSeen.has(f.relPath)
      )
      .map((f) => f.relPath)
    pullKeySel.value = preview.candidates
      .filter(isPullActionable)
      .map(candidateId)
    showSeenFiles.value = preview.files.some(
      (f) =>
        f.reason === GitSyncPullReason.SEEN_FILE && needsSeen.has(f.relPath)
    )
    pullQuery.value = ''
    pullDecisionFilter.value = 'all'
    pullExpanded.value = {}
    if ((preview.counts?.conflict ?? 0) > 0) {
      await loadAll()
    }
    if (
      !preview.candidates.some(
        (c) => c.decision === 'apply-theirs' || c.decision === 'conflict'
      )
    ) {
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
      description: `Published ${result?.applied ?? 0}, kept ${result?.kept ?? 0}, conflicts ${result?.conflicts ?? 0}, files ${result?.files ?? 0}`,
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
    pushQuery.value = ''
    pushExpanded.value = {}
    if ((preview.counts?.conflict ?? 0) > 0) {
      await loadAll()
    }
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
      reconciled?: boolean
      conflicts?: number
    }>(`/api/projects/${projectId.value}/git-sync/push/apply`, {
      method: 'POST',
      body: {
        previewId: pushPreview.value.previewId,
        selectedKeys: pushKeySel.value,
      },
    })
    const skipped = result.skipped?.length ?? 0
    const conflictsN = result.conflicts ?? 0
    toast.add({
      title: result?.reconciled
        ? 'Already on Git — records updated'
        : result?.pushed
          ? 'Push finished'
          : 'Nothing to push',
      description: result?.reconciled
        ? `${result.count} keys had already landed; platform records are now in sync`
        : result?.filename
          ? `${result.count} keys → ${result.filename}${skipped ? ` · ${skipped} skipped` : ''}${conflictsN ? ` · ${conflictsN} conflict(s)` : ''}`
          : undefined,
      color: conflictsN ? 'warning' : 'success',
    })
    pushPreview.value = null
    await loadAll()
  } catch {
    await loadAll()
  } finally {
    applying.value = false
  }
}

function cancelPreview() {
  pullPreview.value = null
  pushPreview.value = null
}

function chosenConflictText(
  conflict: GitSyncConflictRow,
  action:
    | typeof GitSyncConflictStatus.OURS
    | typeof GitSyncConflictStatus.THEIRS
    | typeof GitSyncConflictStatus.MERGED,
  text?: string
): string {
  switch (action) {
    case GitSyncConflictStatus.OURS:
      return conflict.oursText
    case GitSyncConflictStatus.THEIRS:
      return conflict.theirsText
    case GitSyncConflictStatus.MERGED:
      return text ?? conflict.oursText
    default: {
      const _exhaustive: never = action
      return _exhaustive
    }
  }
}

function markPushCandidateResolved(key: string, locale: string, chosen: string) {
  const preview = pushPreview.value
  if (!preview || preview.sourceLocale !== locale) return
  pushPreview.value = {
    ...preview,
    candidates: preview.candidates.map((c) =>
      c.key === key
        ? {
            ...c,
            text: chosen,
            theirsText: chosen,
            baseText: chosen,
            reason: GitSyncPushReason.UNCHANGED,
            eligible: false,
          }
        : c
    ),
    counts: {
      ...preview.counts,
      conflict: Math.max(0, (preview.counts.conflict ?? 1) - 1),
      unchanged: (preview.counts.unchanged ?? 0) + 1,
    },
  }
  pushKeySel.value = pushKeySel.value.filter((k) => k !== key)
}

function markPullCandidateResolved(key: string, locale: string) {
  const preview = pullPreview.value
  if (!preview) return
  pullPreview.value = {
    ...preview,
    candidates: preview.candidates.filter(
      (c) => !(c.key === key && c.locale === locale)
    ),
    counts: {
      ...preview.counts,
      conflict: Math.max(0, preview.counts.conflict - 1),
    },
  }
  const id = `${key}\0${locale}`
  pullKeySel.value = pullKeySel.value.filter((k) => k !== id)
  const next = pullPreview.value
  if (
    next &&
    !next.candidates.some(
      (c) => c.decision === 'conflict' || c.decision === 'apply-theirs'
    )
  ) {
    pullPreview.value = null
    toast.add({
      title: 'Conflicts resolved',
      description: 'Nothing left to apply for this pull.',
      color: 'success',
    })
  }
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
    const chosen = chosenConflictText(conflict, action, text)
    markPushCandidateResolved(conflict.key, conflict.locale, chosen)
    markPullCandidateResolved(conflict.key, conflict.locale)
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
        Pull confirmed Git text onto the platform (published). Push published
        source strings. Resolve conflicts here — not on Translations.
      </p>
    </header>

    <div class="p-6 flex flex-col gap-6">
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
          <!-- The page runs full width for the review tables; form fields are
               capped so inputs do not stretch across the whole screen. -->
          <h2 class="font-semibold">Set up Git sync</h2>
          <p class="max-w-3xl text-sm text-muted">
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
          <div class="max-w-2xl flex flex-col gap-4">
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
        </div>
      </template>

      <template v-else-if="status && configured">
        <div
          class="rounded-xl border border-default bg-default p-5 flex flex-col gap-4"
        >
          <div class="flex flex-wrap items-center justify-between gap-3">
            <div class="min-w-0">
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
                {{ openCount }} open conflict(s). Resolve the cards below
                before Apply pull or Push.
              </p>
            </div>
            <div class="ml-auto shrink-0 flex flex-wrap items-center gap-2">
              <UButton
                class="shrink-0"
                :ui="{ label: 'whitespace-nowrap' }"
                :loading="pulling"
                color="primary"
                icon="i-lucide:arrow-down-to-line"
                label="Pull"
                @click="startPull"
              />
              <UButton
                class="shrink-0"
                :ui="{ label: 'whitespace-nowrap' }"
                :loading="pushing"
                :disabled="openCount > 0"
                color="neutral"
                icon="i-lucide:arrow-up-to-line"
                label="Push"
                @click="startPush"
              />
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
            class="pt-3 border-t border-default"
          >
            <!-- Divider spans the card; fields stay readable and centred. -->
            <div class="mx-auto max-w-2xl w-full flex flex-col gap-4">
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
              <UButton
                class="w-full justify-center"
                :loading="saving"
                @click="saveBinding"
              >
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
            <div class="min-w-0">
              <h2 class="font-semibold">Review pull</h2>
              <p class="mt-1 text-sm text-muted">
                {{ pullFileSel.length }} of
                {{ pullPreview.files.length }} file(s)
                · {{ pullKeySel.length }} of
                {{ pullPreview.candidates.length }} change(s) selected.
                Confirming Apply publishes Git text for selected Git-ahead
                rows. Conflict rows cannot be checked — resolve the cards
                below first. After every conflict in this preview is
                resolved, Apply is enabled for remaining Git-ahead rows, or
                the review closes if none remain.
              </p>
              <p class="mt-1 text-xs text-muted">
                Remote {{ pullPreview.commitSha.slice(0, 8) }} · expires
                {{ formatTime(pullPreview.expiresAt) }}
              </p>
            </div>
            <!-- `ml-auto` keeps the pair right-aligned even when it wraps onto
                 its own line, so Pull and Push read the same. -->
            <div class="ml-auto shrink-0 flex items-center gap-2">
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
                :disabled="!pullCanConfirm"
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
              class="flex items-center gap-3 rounded-lg bg-muted px-3 py-1.5"
            >
              <UCheckbox
                :model-value="isSelected('pullFile', file.relPath)"
                @update:model-value="
                  setPullFileSelected(file.relPath, $event)
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
            <div
              class="flex flex-wrap items-center justify-between gap-2"
            >
              <h3 class="text-sm font-medium">Changes</h3>
              <div class="flex flex-wrap items-center gap-2">
                <UInput
                  v-model="pullQuery"
                  class="w-48"
                  size="sm"
                  icon="i-lucide:search"
                  placeholder="Search keys"
                />
                <USelect
                  v-model="pullDecisionFilter"
                  class="w-48"
                  size="sm"
                  :items="pullDecisionItems"
                />
                <UButton
                  size="xs"
                  color="neutral"
                  variant="ghost"
                  label="Select visible"
                  @click="selectVisiblePull(true)"
                />
                <UButton
                  size="xs"
                  color="neutral"
                  variant="ghost"
                  label="Clear visible"
                  @click="selectVisiblePull(false)"
                />
              </div>
            </div>
            <div
              class="max-h-[60vh] overflow-auto rounded-lg border border-default"
            >
              <UTable
                v-model:expanded="pullExpanded"
                sticky="header"
                class="w-full"
                :data="pullTableRows"
                :columns="pullColumns"
                :get-row-id="(row: PullCandidate) => candidateId(row)"
                :expanded-options="{ getRowCanExpand: () => true }"
                :ui="{ th: 'bg-default', td: 'align-middle bg-default' }"
              >
                <template #select-header>
                  <UCheckbox
                    :model-value="pullHeaderChecked()"
                    @update:model-value="selectVisiblePull($event === true)"
                  />
                </template>
                <template #select-cell="{ row }">
                  <UCheckbox
                    :disabled="!isPullActionable(row.original)"
                    :model-value="
                      isSelected('pullKey', candidateId(row.original))
                    "
                    @update:model-value="
                      setSelected(
                        'pullKey',
                        candidateId(row.original),
                        $event
                      )
                    "
                  />
                </template>
                <template #key-cell="{ row }">
                  <code
                    class="text-xs font-mono break-all"
                    :class="{ 'text-muted': !isPullActionable(row.original) }"
                    :title="row.original.key"
                  >
                    {{ formatI18nKeyDisplay(row.original.key) }}
                  </code>
                </template>
                <template #decision-cell="{ row }">
                  <UBadge
                    variant="subtle"
                    :color="decisionColor(row.original.decision)"
                  >
                    {{
                      decisionLabel[row.original.decision] ??
                      row.original.decision
                    }}
                  </UBadge>
                </template>
                <template #text-cell="{ row }">
                  <p
                    class="max-w-xs truncate text-sm text-muted"
                    :title="row.original.theirsText"
                  >
                    {{ row.original.theirsText || '—' }}
                  </p>
                </template>
                <template #expand-cell="{ row }">
                  <UButton
                    size="xs"
                    color="neutral"
                    variant="ghost"
                    square
                    :icon="
                      row.getIsExpanded()
                        ? 'i-lucide:chevron-up'
                        : 'i-lucide:chevron-down'
                    "
                    @click="row.toggleExpanded()"
                  />
                </template>
                <template #expanded="{ row }">
                  <div class="grid grid-cols-1 md:grid-cols-2 gap-3 py-1">
                    <div>
                      <p class="text-xs font-medium mb-1">Git</p>
                      <p class="text-sm whitespace-pre-wrap break-words">
                        {{ row.original.theirsText || '—' }}
                      </p>
                    </div>
                    <div v-if="row.original.oursText !== row.original.theirsText">
                      <p class="text-xs font-medium mb-1">Platform draft</p>
                      <p
                        class="text-sm text-muted whitespace-pre-wrap break-words"
                      >
                        {{ row.original.oursText || '—' }}
                      </p>
                    </div>
                  </div>
                </template>
                <template #empty>
                  <div class="py-8 text-center text-sm text-muted">
                    No key changes in the selected files.
                  </div>
                </template>
              </UTable>
            </div>
          </div>
        </div>

        <div
          v-if="pushPreview"
          class="rounded-xl border border-primary/40 bg-default p-5 flex flex-col gap-4"
        >
          <div class="flex flex-wrap items-start justify-between gap-3">
            <div class="min-w-0">
              <h2 class="font-semibold">Review push</h2>
              <p class="mt-1 text-sm text-muted">
                {{ pushKeySel.length }} of
                {{ pushPreview.candidates.length }} source key(s) selected
                ({{ pushPreview.sourceLocale }}). Nothing is committed until
                you confirm.                 Git-ahead keys stay on Git unless you check them
                (overwrites Git). Both-changed keys cannot be checked — use
                the conflict cards below.
              </p>
              <p class="mt-1 text-xs text-muted">
                Expires {{ formatTime(pushPreview.expiresAt) }}
              </p>
            </div>
            <!-- Same right-alignment rule as Review pull. -->
            <div class="ml-auto shrink-0 flex items-center gap-2">
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
                :disabled="!pushCanConfirm"
                @click="confirmPush"
              >
                Commit push
              </UButton>
            </div>
          </div>

          <div class="flex flex-col gap-2">
            <div
              class="flex flex-wrap items-center justify-between gap-2"
            >
              <h3 class="text-sm font-medium">Keys</h3>
              <div class="flex flex-wrap items-center gap-2">
                <UInput
                  v-model="pushQuery"
                  class="w-48"
                  size="sm"
                  icon="i-lucide:search"
                  placeholder="Search keys"
                />
                <UCheckbox
                  v-model="showFilteredKeys"
                  label="Show filtered out"
                />
                <UButton
                  size="xs"
                  color="neutral"
                  variant="ghost"
                  label="Select visible"
                  @click="selectVisiblePush(true)"
                />
                <UButton
                  size="xs"
                  color="neutral"
                  variant="ghost"
                  label="Clear visible"
                  @click="selectVisiblePush(false)"
                />
              </div>
            </div>
            <div
              class="max-h-[60vh] overflow-auto rounded-lg border border-default"
            >
              <UTable
                v-model:expanded="pushExpanded"
                sticky="header"
                class="w-full"
                :data="pushTableRows"
                :columns="pushColumns"
                :get-row-id="(row: PushCandidate) => row.key"
                :expanded-options="{ getRowCanExpand: () => true }"
                :ui="{ th: 'bg-default', td: 'align-middle bg-default' }"
              >
                <template #select-header>
                  <UCheckbox
                    :model-value="pushHeaderChecked()"
                    @update:model-value="selectVisiblePush($event === true)"
                  />
                </template>
                <template #select-cell="{ row }">
                  <UCheckbox
                    :disabled="!isPushRowSelectable(row.original)"
                    :model-value="isSelected('pushKey', row.original.key)"
                    @update:model-value="
                      setSelected('pushKey', row.original.key, $event)
                    "
                  />
                </template>
                <template #key-cell="{ row }">
                  <code
                    class="text-xs font-mono break-all"
                    :class="{ 'text-muted': !isPushRowSelectable(row.original) }"
                    :title="row.original.key"
                  >
                    {{ formatI18nKeyDisplay(row.original.key) }}
                  </code>
                </template>
                <template #reason-cell="{ row }">
                  <UBadge
                    variant="subtle"
                    :color="pushReasonColor(row.original.reason)"
                  >
                    {{
                      pushReasonLabel[row.original.reason] ??
                      row.original.reason
                    }}
                  </UBadge>
                </template>
                <template #text-cell="{ row }">
                  <p
                    class="max-w-xs truncate text-sm text-muted"
                    :title="row.original.text"
                  >
                    {{ row.original.text || '—' }}
                  </p>
                </template>
                <template #expand-cell="{ row }">
                  <UButton
                    size="xs"
                    color="neutral"
                    variant="ghost"
                    square
                    :icon="
                      row.getIsExpanded()
                        ? 'i-lucide:chevron-up'
                        : 'i-lucide:chevron-down'
                    "
                    @click="row.toggleExpanded()"
                  />
                </template>
                <template #expanded="{ row }">
                  <div class="grid grid-cols-1 md:grid-cols-3 gap-3 py-1">
                    <div>
                      <p class="text-xs font-medium mb-1">Published source</p>
                      <p class="text-sm whitespace-pre-wrap break-words">
                        {{ row.original.text || '—' }}
                      </p>
                    </div>
                    <div>
                      <p class="text-xs font-medium mb-1">Git source</p>
                      <p
                        class="text-sm text-muted whitespace-pre-wrap break-words"
                      >
                        {{ row.original.theirsText || '—' }}
                      </p>
                    </div>
                    <div
                      v-if="
                        row.original.baseText &&
                        row.original.baseText !== row.original.text
                      "
                    >
                      <p class="text-xs font-medium mb-1">Last pushed</p>
                      <p
                        class="text-sm text-muted whitespace-pre-wrap break-words"
                      >
                        {{ row.original.baseText }}
                      </p>
                    </div>
                  </div>
                </template>
                <template #empty>
                  <div class="py-8 text-center text-sm text-muted">
                    No keys to show.
                  </div>
                </template>
              </UTable>
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
