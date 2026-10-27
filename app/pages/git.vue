<script setup lang="ts">
import { useIntervalFn, useStorage } from '@vueuse/core'
import {
  GIT_SYNC_DEFAULT_PATTERN,
  GitCredentialKind,
  GitSyncAdapter,
  GitSyncConflictStatus,
  GitSyncErrorCode,
  GitSyncFileFormat,
  GitSyncPreviewKind,
  GitSyncPullReason,
  GitSyncPushReason,
} from '#shared/constants'
import { validID } from '#shared/utils'
import { isHttpsRemoteUrl, normalizeGitHttpsRemote } from '#shared/schemas'
import type {
  GitSyncBindingPublic,
  GitSyncStatus,
  IGitReviewItem,
  IGitReviewSection,
  IGitSyncConflictRow,
  PullApplyResult,
  PullCandidate,
  PullPreview,
  PushCandidate,
  PushPreview,
  ThreeWayDecision,
} from '#shared/types/GitSync'
import { GitSyncHistoryModal } from '#components'

definePageMeta({
  middleware: ['protected'],
  ssr: false,
})

/** How often an open preview checks it is still the current one. */
const GIT_STATUS_POLL_MS = 30_000

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

const status = ref<GitSyncStatus | null>(null)
const conflicts = ref<IGitSyncConflictRow[]>([])
const productItems = ref<{ value: string; label: string }[]>([])

const pullPreview = ref<PullPreview | null>(null)
const pushPreview = ref<PushPreview | null>(null)
const pullFileSel = ref<string[]>([])
const pullKeySel = ref<string[]>([])
const pushKeySel = ref<string[]>([])
const applying = ref(false)
const pullQuery = ref('')
const pushQuery = ref('')
const pullDecisionFilter = ref<ThreeWayDecision | 'all'>('all')
const pushReasonFilter = ref<GitSyncPushReason | 'all'>('all')
const focusedId = ref<string | null>(null)

const form = reactive({
  enabled: true,
  adapter: GitSyncAdapter.LILT_SWBU,
  product: '',
  pattern: GIT_SYNC_DEFAULT_PATTERN,
  format: GitSyncFileFormat.NESTED_JSON,
  credentialKind: GitCredentialKind.REPO_ACCESS_TOKEN,
  token: '',
  remoteUrl: '',
  branch: 'main',
})

const isLilt = computed(() => form.adapter === GitSyncAdapter.LILT_SWBU)

/** LILT: the product folder. Locale files: `dir/pattern`, as the files are named. */
const bindingTitle = computed(() => {
  const binding = status.value?.binding
  if (!binding) return ''
  if (binding.adapter !== GitSyncAdapter.LOCALE_FILES) return binding.product
  return `${binding.product}/${binding.options?.pattern || GIT_SYNC_DEFAULT_PATTERN}`
})

const projectId = computed(() => curProject.value.id)
const isSteward = computed(() => Boolean(status.value?.isSteward))
const configured = computed(() => Boolean(status.value?.configured))
const openCount = computed(
  () => status.value?.openConflicts ?? conflicts.value.length
)
/** Keys with an open card in any locale; their other rows wait for it too. */
const conflictedKeys = computed(
  () => new Set(conflicts.value.map((c) => c.key))
)
const pullCanConfirm = computed(() => {
  if (!pullPreview.value) return false
  const selected = new Set(pullKeySel.value)
  return pullPreview.value.candidates.some(
    (c) => selected.has(candidateId(c)) && isPullActionable(c)
  )
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
  form.adapter =
    binding?.adapter === GitSyncAdapter.LOCALE_FILES
      ? GitSyncAdapter.LOCALE_FILES
      : GitSyncAdapter.LILT_SWBU
  form.product = binding?.product ?? ''
  form.pattern = binding?.options?.pattern || GIT_SYNC_DEFAULT_PATTERN
  form.format =
    binding?.options?.format === GitSyncFileFormat.FLAT_JSON
      ? GitSyncFileFormat.FLAT_JSON
      : GitSyncFileFormat.NESTED_JSON
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
    if (next.configured) {
      conflicts.value =
        (await useApi<IGitSyncConflictRow[]>(
          `/api/projects/${projectId.value}/git-sync/conflicts`
        )) ?? []
    } else {
      conflicts.value = []
    }
  } finally {
    loading.value = false
  }
}

/**
 * Previews, selections and inline edits describe the project they were made in,
 * so switching projects drops them rather than restoring them. A surviving pull
 * or push preview is the worst of the lot: it renders the previous project's key
 * text under the new project's header.
 */
function clearSessionState() {
  pullPreview.value = null
  pushPreview.value = null
  pullFileSel.value = []
  pullKeySel.value = []
  pushKeySel.value = []
  focusedId.value = null
  resolvingId.value = null
  showSettings.value = false
}

function restoreGitFilters(id: ID) {
  const saved = readGitFilterForProject(id)
  pullQuery.value = saved.pullQuery
  pushQuery.value = saved.pushQuery
  pullDecisionFilter.value = saved.pullDecision
  pushReasonFilter.value = saved.pushReason
}

function persistGitFilters() {
  writeGitFilterForProject(projectId.value, {
    pullQuery: pullQuery.value,
    pushQuery: pushQuery.value,
    pullDecision: pullDecisionFilter.value,
    pushReason: pushReasonFilter.value,
  })
}

// These four have no other watcher, so one watch covers "remember on change".
// The restore below also trips it, harmlessly: by then the project id is the new
// one, so it writes the values it just restored.
watch([pullQuery, pushQuery, pullDecisionFilter, pushReasonFilter], () => {
  persistGitFilters()
})

// A dismissed slideover must not keep unsaved edits or a typed token.
watch(showSettings, (open) => {
  if (!open && configured.value) applyBindingToForm(status.value?.binding ?? null)
})

watch(
  () => projectId.value,
  (id) => {
    clearSessionState()
    restoreGitFilters(id)
    loadAll()
  }
)

onMounted(() => {
  // Before the first load, so a reload keeps this project's filters too.
  restoreGitFilters(projectId.value)
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
          adapter: form.adapter,
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
      title: isLilt.value ? 'Product required' : 'Directory required',
      description: isLilt.value
        ? 'Load products from the remote, then choose one.'
        : 'Type the folder that holds the locale files, e.g. src/locales.',
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
        adapter: form.adapter,
        product: form.product.trim(),
        options: isLilt.value
          ? undefined
          : { pattern: form.pattern.trim() || undefined, format: form.format },
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
    showSettings.value = false
    await loadAll()
  } finally {
    saving.value = false
  }
}

function candidateId(c: PullCandidate) {
  return `${c.key}\0${c.locale}`
}

/** Only Git-ahead rows are applied. Conflicts are resolved in the detail pane. */
function isPullActionable(c: PullCandidate) {
  return c.decision === 'apply-theirs' && !conflictedKeys.value.has(c.key)
}

/**
 * Bulk selection skips translations of an older source: applying one would
 * publish text for a sentence the key no longer has. Still checkable by hand.
 */
function isPullBulkSelectable(c: PullCandidate) {
  return isPullActionable(c) && !c.staleSource
}

function isPushRowSelectable(c: PushCandidate) {
  return (
    c.eligible || c.reason === GitSyncPushReason.REMOTE_CHANGED
  )
}

/** Files that still hold a row needing a decision. */
const pullFilesNeedingWork = computed(
  () =>
    new Set(
      (pullPreview.value?.candidates ?? [])
        .filter(
          (c) => c.decision === 'apply-theirs' || c.decision === 'conflict'
        )
        .map((c) => c.relPath)
        .filter(Boolean)
    )
)

/**
 * Already-pulled files are hidden unless they are still Git-ahead, so the list
 * only shows work that is left.
 */
const pullVisibleFiles = computed(() =>
  (pullPreview.value?.files ?? []).filter(
    (f) =>
      f.reason !== GitSyncPullReason.SEEN_FILE ||
      pullFilesNeedingWork.value.has(f.relPath)
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
  const reason = pushReasonFilter.value
  return (pushPreview.value?.candidates ?? []).filter((c) => {
    // Default view is the proposal plus rows that still need a decision.
    // Filtered-out reasons are only reachable by picking that reason.
    if (reason !== 'all') {
      if (c.reason !== reason) return false
    } else if (
      !c.eligible &&
      c.reason !== GitSyncPushReason.REMOTE_CHANGED &&
      c.reason !== GitSyncPushReason.CONFLICT
    ) {
      return false
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

const pushReasonItems = [
  { label: 'All reasons', value: 'all' },
  { label: 'New key', value: GitSyncPushReason.NEW_KEY },
  { label: 'Changed', value: GitSyncPushReason.CHANGED },
  { label: 'Unchanged', value: GitSyncPushReason.UNCHANGED },
  { label: 'No published text', value: GitSyncPushReason.NOT_PUBLISHED },
  { label: 'Auto draft key', value: GitSyncPushReason.DRAFT_KEY },
  { label: 'Cannot be written', value: GitSyncPushReason.UNWRITABLE },
  { label: 'Git is ahead', value: GitSyncPushReason.REMOTE_CHANGED },
  { label: 'Conflict', value: GitSyncPushReason.CONFLICT },
]

const pushReasonLabel: Record<string, string> = {
  [GitSyncPushReason.NEW_KEY]: 'New key',
  [GitSyncPushReason.CHANGED]: 'Changed',
  [GitSyncPushReason.UNCHANGED]: 'Unchanged since last push',
  [GitSyncPushReason.NOT_PUBLISHED]: 'No published source text',
  [GitSyncPushReason.DRAFT_KEY]: 'Auto draft key',
  [GitSyncPushReason.UNWRITABLE]:
    'Cannot be written — clashes with an existing key path in the file',
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
    const add = fromFile.filter(isPullBulkSelectable).map(candidateId)
    pullKeySel.value = [...new Set([...pullKeySel.value, ...add])]
    return
  }
  const drop = new Set(fromFile.map(candidateId))
  pullKeySel.value = pullKeySel.value.filter((id) => !drop.has(id))
}

function selectVisiblePull(on: boolean) {
  const ids = pullTableRows.value.filter(isPullBulkSelectable).map(candidateId)
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
  const ids = pullTableRows.value.filter(isPullBulkSelectable).map(candidateId)
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
    case GitSyncPushReason.UNWRITABLE:
      return 'warning'
    case GitSyncPushReason.UNCHANGED:
    case GitSyncPushReason.NOT_PUBLISHED:
    case GitSyncPushReason.DRAFT_KEY:
      return 'neutral'
    default:
      return 'neutral'
  }
}

type ReviewMode = 'conflicts' | 'pull' | 'push'

/** Pull and push previews are exclusive; with neither, the list is the open conflicts. */
const reviewMode = computed<ReviewMode>(() => {
  if (pullPreview.value) return 'pull'
  if (pushPreview.value) return 'push'
  return 'conflicts'
})

const reviewItems = computed<IGitReviewItem[]>(() => {
  const mode = reviewMode.value
  switch (mode) {
    case 'pull':
      return pullTableRows.value.map((c) => ({
        id: candidateId(c),
        key: c.key,
        locale: c.locale,
        text: c.theirsText,
        label: decisionLabel[c.decision],
        color: decisionColor(c.decision),
        selectable: isPullActionable(c),
        conflict: c.decision === 'conflict',
        staleSource: c.staleSource,
      }))
    case 'push':
      return pushTableRows.value.map((c) => ({
        id: c.key,
        key: c.key,
        locale: pushPreview.value?.sourceLocale ?? null,
        text: c.text,
        label:
          pushReasonItems.find((item) => item.value === c.reason)?.label ??
          c.reason,
        color: pushReasonColor(c.reason),
        selectable: isPushRowSelectable(c),
        conflict: c.reason === GitSyncPushReason.CONFLICT,
      }))
    case 'conflicts':
      return conflicts.value.map((c) => ({
        id: `c:${c.id}`,
        key: c.key,
        locale: c.locale,
        text: c.theirsText,
        label: 'Conflict',
        color: 'warning',
        selectable: false,
        conflict: true,
      }))
    default: {
      const _exhaustive: never = mode
      return _exhaustive
    }
  }
})

/** The focused row, or the first one once it has been resolved away. */
const activeItem = computed(
  () =>
    reviewItems.value.find((item) => item.id === focusedId.value) ??
    reviewItems.value[0] ??
    null
)

const activeConflict = computed(() => {
  const item = activeItem.value
  if (!item?.conflict) return null
  if (reviewMode.value === 'conflicts') {
    return conflicts.value.find((c) => `c:${c.id}` === item.id) ?? null
  }
  return (
    conflicts.value.find(
      (c) => c.key === item.key && c.locale === item.locale
    ) ?? null
  )
})

const activeSections = computed<IGitReviewSection[]>(() => {
  const item = activeItem.value
  if (!item) return []
  const mode = reviewMode.value
  switch (mode) {
    case 'pull': {
      const c = pullPreview.value?.candidates.find(
        (row) => candidateId(row) === item.id
      )
      if (!c) return []
      const sections: IGitReviewSection[] = [
        {
          label: 'In Git',
          hint: 'The text in the repo. Apply pull publishes this.',
          text: c.theirsText,
          tone: 'git',
        },
      ]
      if (c.oursText !== c.theirsText) {
        sections.push({
          label: 'On platform (draft)',
          hint: 'Your current draft. It is replaced if you apply this change.',
          text: c.oursText,
          tone: 'platform',
        })
      }
      if (c.staleSource && c.writtenAgainst) {
        sections.push({
          label: 'Translated from (older source)',
          hint: 'The source wording this translation was written for. The source has changed since.',
          text: c.writtenAgainst,
          tone: 'warning',
        })
      }
      return sections
    }
    case 'push': {
      const c = pushPreview.value?.candidates.find(
        (row) => row.key === item.id
      )
      if (!c) return []
      const sections: IGitReviewSection[] = [
        {
          label: 'On platform (published)',
          hint: 'The published source text in Localness. Push sends this to Git.',
          text: c.text,
          tone: 'platform',
        },
        {
          label: 'In Git',
          hint: 'The text currently in the repo. Push overwrites it if you tick this key.',
          text: c.theirsText,
          tone: 'git',
        },
      ]
      if (c.baseText && c.baseText !== c.text) {
        sections.push({
          label: 'Last pushed',
          hint: 'What Localness sent to Git last time.',
          text: c.baseText,
          tone: 'reference',
          optional: true,
        })
      }
      sections.push({
        label: 'Why it is listed',
        text: pushReasonLabel[c.reason] ?? c.reason,
        tone: 'reference',
      })
      return sections
    }
    case 'conflicts':
      return []
    default: {
      const _exhaustive: never = mode
      return _exhaustive
    }
  }
})

const reviewSelectedIds = computed(() => {
  const mode = reviewMode.value
  switch (mode) {
    case 'pull':
      return pullKeySel.value
    case 'push':
      return pushKeySel.value
    case 'conflicts':
      return []
    default: {
      const _exhaustive: never = mode
      return _exhaustive
    }
  }
})

const reviewHeaderChecked = computed(() => {
  const mode = reviewMode.value
  switch (mode) {
    case 'pull':
      return pullHeaderChecked()
    case 'push':
      return pushHeaderChecked()
    case 'conflicts':
      return false
    default: {
      const _exhaustive: never = mode
      return _exhaustive
    }
  }
})

const reviewEmptyText = computed(() => {
  const mode = reviewMode.value
  switch (mode) {
    case 'pull':
      return 'No key changes in the selected files.'
    case 'push':
      return pushReasonFilter.value === 'all'
        ? 'Nothing to push. Pick a reason to see the keys that were filtered out.'
        : 'No keys with this reason.'
    case 'conflicts':
      return 'No open conflicts. Pull or Push to review changes.'
    default: {
      const _exhaustive: never = mode
      return _exhaustive
    }
  }
})

function onReviewToggle(id: string, on: boolean | 'indeterminate') {
  if (reviewMode.value === 'pull') setSelected('pullKey', id, on)
  else if (reviewMode.value === 'push') setSelected('pushKey', id, on)
}

function onReviewToggleAll(on: boolean | 'indeterminate') {
  if (reviewMode.value === 'pull') selectVisiblePull(on === true)
  else if (reviewMode.value === 'push') selectVisiblePush(on === true)
}

function moveFocus(delta: -1 | 1) {
  const items = reviewItems.value
  const index = items.findIndex((item) => item.id === activeItem.value?.id)
  const next = items[Math.min(Math.max(index + delta, 0), items.length - 1)]
  if (next) focusedId.value = next.id
}

function toggleFocusedSelection() {
  const item = activeItem.value
  if (!item?.selectable) return
  onReviewToggle(item.id, !reviewSelectedIds.value.includes(item.id))
}

/** Reference texts (last synced, published, last pushed) stay folded by default. */
const showCompare = useStorage('git-review-compare', false)
const detailBusy = ref(false)

/** Same rules as Translations: ↑ ↓ move, a letter acts, typing is never taken. */
function onKeydown(event: KeyboardEvent) {
  if (event.metaKey || event.ctrlKey || event.altKey) return
  const target = event.target as HTMLElement | null
  if (
    target &&
    (target.tagName === 'INPUT' ||
      target.tagName === 'TEXTAREA' ||
      target.tagName === 'SELECT' ||
      target.isContentEditable)
  ) {
    return
  }
  // A dialog or a drawer over the page owns the keyboard.
  if (document.querySelector('[role="dialog"]')) return
  // So does an open filter menu: its arrow keys are for the menu.
  if (target?.closest('[role="listbox"],[role="menu"],[role="combobox"]')) return
  const conflict = activeConflict.value
  const canResolve =
    conflict && resolvingId.value === null && !detailBusy.value
  if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
    event.preventDefault()
    moveFocus(event.key === 'ArrowDown' ? 1 : -1)
  } else if (event.key === 'x') {
    event.preventDefault()
    toggleFocusedSelection()
  } else if (event.key === 'c') {
    event.preventDefault()
    showCompare.value = !showCompare.value
  } else if (event.key === 'g' && conflict && canResolve) {
    event.preventDefault()
    void resolve(conflict, GitSyncConflictStatus.THEIRS)
  } else if (event.key === 'p' && conflict && canResolve) {
    event.preventDefault()
    void resolve(conflict, GitSyncConflictStatus.OURS)
  }
}

onMounted(() => window.addEventListener('keydown', onKeydown))
onUnmounted(() => window.removeEventListener('keydown', onKeydown))

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
    focusedId.value = null
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
    // The preview opens and closes cards, and the key selection below
    // depends on which keys still have one.
    if ((preview.counts?.conflict ?? 0) > 0 || openCount.value > 0) {
      await loadAll()
    }
    pullKeySel.value = preview.candidates
      .filter(isPullBulkSelectable)
      .map(candidateId)
    pullQuery.value = ''
    pullDecisionFilter.value = 'all'
    if (preview.ignoredLocales?.length) {
      toast.add({
        title: 'Some Git locales were skipped',
        description: `${preview.ignoredLocales.join(', ')} ${preview.ignoredLocales.length === 1 ? 'is' : 'are'} not in this project's locales. Add them in project settings to pull them.`,
        color: 'neutral',
      })
    }
    if (
      !preview.candidates.some(
        (c) => c.decision === 'apply-theirs' || c.decision === 'conflict'
      )
    ) {
      toast.add({
        title: 'Nothing new to pull',
        description: 'No new or changed files on the remote.',
        color: 'neutral',
      })
    }
  } catch (error) {
    await recoverFromSyncError(error)
  } finally {
    pulling.value = false
  }
}

async function confirmPull() {
  if (!validID(projectId.value) || !pullPreview.value) return
  applying.value = true
  try {
    const result = await useApi<PullApplyResult>(
      `/api/projects/${projectId.value}/git-sync/pull/apply`,
      {
        method: 'POST',
        body: {
          previewId: pullPreview.value.previewId,
          selectedFiles: pullFileSel.value,
          selectedKeys: pullKeySel.value,
        },
      }
    )
    const kept = result?.kept ?? 0
    const blocked = result?.blocked.length ?? 0
    const notes = [
      kept
        ? `${kept} row(s) were edited on the platform after the preview and kept as they are — run a new pull to review them.`
        : '',
      blocked
        ? `${blocked} row(s) wait for an open conflict on the same key.`
        : '',
    ].filter(Boolean)
    toast.add({
      title: 'Pull finished',
      description: notes.length
        ? `Published ${result?.applied ?? 0}. ${notes.join(' ')}`
        : `Published ${result?.applied ?? 0}, files ${result?.files ?? 0}`,
      color: notes.length ? 'warning' : 'success',
    })
    pullPreview.value = null
    await loadAll()
  } catch (error) {
    await recoverFromSyncError(error)
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
    focusedId.value = null
    pushKeySel.value = preview.candidates
      .filter((c) => c.eligible)
      .map((c) => c.key)
    pushReasonFilter.value = 'all'
    pushQuery.value = ''
    if ((preview.counts?.conflict ?? 0) > 0) {
      await loadAll()
    }
  } catch (error) {
    await recoverFromSyncError(error)
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
  } catch (error) {
    await recoverFromSyncError(error)
  } finally {
    applying.value = false
  }
}

function cancelPreview() {
  pullPreview.value = null
  pushPreview.value = null
  focusedId.value = null
}

/** The code a sync endpoint put on its refusal, read from a `$fetch` error. */
function syncErrorCode(error: unknown): GitSyncErrorCode | null {
  const code = (error as { data?: { data?: { code?: unknown } } } | null)?.data
    ?.data?.code
  return Object.values(GitSyncErrorCode).includes(code as GitSyncErrorCode)
    ? (code as GitSyncErrorCode)
    : null
}

/**
 * After a refusal the page's preview or cards may describe a state the server
 * has moved past. `useApi` already showed the message; this re-syncs the page.
 */
async function recoverFromSyncError(error: unknown) {
  const code = syncErrorCode(error)
  switch (code) {
    case GitSyncErrorCode.BINDING_CHANGED:
    case GitSyncErrorCode.PREVIEW_APPLIED:
    case GitSyncErrorCode.PREVIEW_REPLACED:
    case GitSyncErrorCode.PREVIEW_INVALID:
    case GitSyncErrorCode.REMOTE_MOVED:
      cancelPreview()
      break
    // The preview may still be good once the other sync finishes, or once the
    // reloaded cards are resolved.
    case GitSyncErrorCode.SYNC_BUSY:
    case GitSyncErrorCode.CONFLICT_STALE:
    case GitSyncErrorCode.CONFLICT_RESOLVED:
    case GitSyncErrorCode.CONFLICT_OPEN:
    case null:
      break
    default: {
      const _exhaustive: never = code
      return _exhaustive
    }
  }
  await loadAll()
}

/**
 * While a preview is open someone else may replace it or apply it. The status
 * names the current pending preview of each kind; one the page holds that is
 * not current is gone.
 */
async function pollStatus() {
  if (!validID(projectId.value) || applying.value) return
  const held = pullPreview.value
    ? { kind: GitSyncPreviewKind.PULL, id: pullPreview.value.previewId }
    : pushPreview.value
      ? { kind: GitSyncPreviewKind.PUSH, id: pushPreview.value.previewId }
      : null
  if (!held) return
  const next = await useApi<GitSyncStatus>(
    `/api/projects/${projectId.value}/git-sync`
  ).catch(() => null)
  // An apply that started meanwhile settles the preview itself.
  if (!next || applying.value) return
  status.value = next
  const current = next.pendingPreviews[held.kind]
  if (current?.id === held.id) return
  cancelPreview()
  toast.add({
    title: 'Preview closed',
    description: current
      ? `${current.createdBy || 'Someone'} started a newer ${held.kind} preview.`
      : 'It was applied, cancelled or expired.',
    color: 'warning',
  })
  await loadAll()
}

const statusPoll = useIntervalFn(pollStatus, GIT_STATUS_POLL_MS, {
  immediate: false,
})
watch(
  () => Boolean(pullPreview.value || pushPreview.value),
  (open) => (open ? statusPoll.resume() : statusPoll.pause())
)

function chosenConflictText(
  conflict: IGitSyncConflictRow,
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
  conflict: IGitSyncConflictRow,
  action:
    | typeof GitSyncConflictStatus.OURS
    | typeof GitSyncConflictStatus.THEIRS
    | typeof GitSyncConflictStatus.MERGED
    | typeof GitSyncConflictStatus.RENAMED,
  text?: string,
  newKey?: string
) {
  if (!validID(projectId.value)) return
  resolvingId.value = conflict.id
  try {
    await useApi(
      `/api/projects/${projectId.value}/git-sync/conflicts/${conflict.id}/resolve`,
      {
        method: 'POST',
        body: { action, text, newKey },
      }
    )
    if (action === GitSyncConflictStatus.RENAMED) {
      // The key set changed under the preview, so it now describes a project
      // that no longer exists — patching one candidate would not fix that.
      cancelPreview()
    } else {
      const chosen = chosenConflictText(conflict, action, text)
      markPushCandidateResolved(conflict.key, conflict.locale, chosen)
      markPullCandidateResolved(conflict.key, conflict.locale)
    }
    await loadAll()
  } catch (error) {
    await recoverFromSyncError(error)
  } finally {
    resolvingId.value = null
  }
}

const overlay = useOverlay()
const historyModal = overlay.create(GitSyncHistoryModal)

function openHistory() {
  if (!validID(projectId.value)) return
  historyModal.open({ projectId: projectId.value })
}
</script>

<template>
  <div class="h-full min-w-0 overflow-hidden flex flex-col bg-muted">
    <!-- One bar: the page title, the repo it is bound to, and the actions. -->
    <header
      class="shrink-0 px-6 py-4 bg-default border-b border-default flex flex-wrap items-center gap-x-4 gap-y-3"
    >
      <div class="min-w-0">
        <div class="flex items-center gap-2 min-w-0">
          <h1 class="text-xl font-semibold tracking-tight">Git sync</h1>
          <ProjectOwnerBadge :project="curProject" :visible="isSteward" />
          <UPopover mode="hover" :open-delay="150">
            <UButton
              size="xs"
              color="neutral"
              variant="ghost"
              square
              icon="i-lucide:info"
              aria-label="About Git sync"
            />
            <template #content>
              <p class="w-80 p-3 text-xs text-muted">
                Sync this project against locale files in a Git repo. Pull
                confirmed Git text onto the platform (published). Push
                published source strings. Resolve conflicts here — not on
                Translations.
              </p>
            </template>
          </UPopover>
        </div>
        <div
          v-if="status?.configured && validID(projectId)"
          class="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted"
        >
          <span
            class="inline-flex min-w-0 items-center gap-1 font-medium text-default"
            :title="bindingTitle"
          >
            <UIcon name="i-lucide:git-branch" class="size-3.5 shrink-0" />
            <span class="truncate">{{ bindingTitle }}</span>
          </span>
          <span>Last pull {{ formatTime(status.binding?.lastPulledAt) }}</span>
          <span>Last push {{ formatTime(status.binding?.lastPushedAt) }}</span>
          <UBadge
            v-if="openCount > 0"
            color="warning"
            variant="subtle"
            size="sm"
            icon="i-lucide:triangle-alert"
          >
            {{ openCount }} open conflict{{ openCount === 1 ? '' : 's' }}
          </UBadge>
        </div>
      </div>
      <div
        v-if="status?.configured && validID(projectId)"
        class="ml-auto shrink-0 flex flex-wrap items-center gap-2"
      >
        <UButton
          size="sm"
          color="neutral"
          variant="ghost"
          icon="i-lucide:history"
          label="History"
          @click="openHistory"
        />
        <UButton
          v-if="isSteward"
          size="sm"
          color="neutral"
          variant="ghost"
          icon="i-lucide:settings"
          label="Settings"
          @click="showSettings = true"
        />
        <UButton
          size="sm"
          color="info"
          icon="i-lucide:arrow-down-to-line"
          label="Pull"
          :loading="pulling"
          :ui="{ label: 'whitespace-nowrap' }"
          @click="startPull"
        />
        <UTooltip
          :text="
            openCount > 0
              ? 'Resolve the open conflicts before pushing'
              : 'Push published source strings to Git'
          "
        >
          <UButton
            size="sm"
            color="primary"
            icon="i-lucide:arrow-up-to-line"
            label="Push"
            :loading="pushing"
            :disabled="openCount > 0"
            :ui="{ label: 'whitespace-nowrap' }"
            @click="startPush"
          />
        </UTooltip>
      </div>
    </header>

    <div
      v-if="!validID(projectId) || (loading && !status) || (status && !configured)"
      class="flex-1 min-h-0 overflow-auto p-6 flex flex-col gap-6"
    >
      <UAlert
        v-if="!validID(projectId)"
        color="neutral"
        variant="subtle"
        title="Select a project"
        description="Pick a project in the workspace bar to configure Git sync."
      />

      <div v-else-if="loading && !status" class="text-sm text-muted">
        Loading…
      </div>

      <template v-else>
        <UAlert
          v-if="!isSteward"
          color="warning"
          variant="subtle"
          title="Git sync is not configured"
          description="Contact a Project Owner to configure Git sync."
        />

        <div
          v-else
          class="rounded-xl border border-default bg-default p-5 flex flex-col gap-4"
        >
          <!-- The page runs full width for the review lists; form fields are
               capped so inputs do not stretch across the whole screen. -->
          <h2 class="font-semibold">Set up Git sync</h2>
          <p class="max-w-3xl text-sm text-muted">
            Fill the remote URL and token, then say where the locale files
            live in that repository. Git HTTPS usernames are filled by the server
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
            <GitSyncLayoutFields
              v-model:adapter="form.adapter"
              v-model:product="form.product"
              v-model:pattern="form.pattern"
              v-model:format="form.format"
              :product-items="productItems"
              :discovering="discovering"
              :can-discover="canDiscover"
              :show-discover-hint="isHttpsRemoteUrl(form.remoteUrl) && !canDiscover"
              @load-products="loadProducts"
            />
            <p v-if="configured" class="text-xs text-muted">
              Changing the remote, branch, layout or folder resets sync
              history: open conflicts are dropped and the next pull and push
              compare from scratch.
            </p>
            <UButton
              class="w-full justify-center"
              :loading="saving"
              @click="saveBinding"
            >
              Save settings
            </UButton>
          </div>
        </div>
      </template>
    </div>

    <template v-else-if="status">
      <div
        v-if="reviewMode !== 'conflicts'"
        class="shrink-0 px-6 py-3 bg-default border-b border-default flex flex-wrap items-center gap-2"
      >
        <UPopover v-if="reviewMode === 'pull'">
          <UButton
            size="sm"
            color="neutral"
            variant="outline"
            icon="i-lucide:files"
            :label="`Files ${pullFileSel.length}/${pullVisibleFiles.length}`"
          />
          <template #content>
            <div class="w-80 max-h-80 overflow-auto p-2 flex flex-col gap-1">
              <p
                v-if="!pullVisibleFiles.length"
                class="p-2 text-sm text-muted"
              >
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
                  <p class="truncate text-sm" :title="file.relPath">
                    {{ file.relPath }}
                  </p>
                  <p class="flex items-center gap-1.5 text-xs text-muted">
                    {{ pullReasonLabel[file.reason] ?? file.reason }} ·
                    <LocaleBadge v-if="file.locale" :locale="file.locale" />
                    <template v-else>
                      unmapped ({{ file.remoteLocale }})
                    </template>
                  </p>
                </div>
              </div>
            </div>
          </template>
        </UPopover>
        <template v-if="reviewMode === 'pull'">
          <UInput
            v-model="pullQuery"
            size="sm"
            class="w-56"
            icon="i-lucide:search"
            placeholder="Search key or text"
          />
          <USelectMenu
            v-model="pullDecisionFilter"
            :items="pullDecisionItems"
            value-key="value"
            size="sm"
            class="w-48"
            :search-input="false"
          />
        </template>
        <template v-else>
          <UInput
            v-model="pushQuery"
            size="sm"
            class="w-56"
            icon="i-lucide:search"
            placeholder="Search key or text"
          />
          <USelectMenu
            v-model="pushReasonFilter"
            :items="pushReasonItems"
            value-key="value"
            size="sm"
            class="w-48"
            :search-input="false"
          />
        </template>
      </div>

      <div
        v-if="pullPreview"
        class="shrink-0 px-6 py-2 bg-info/10 border-b border-info/30 flex flex-wrap items-center gap-3"
      >
        <div class="min-w-0">
          <p class="text-sm font-medium">
            Review pull
            <span class="font-normal text-muted">
              · {{ pullFileSel.length }} of {{ pullPreview.files.length }}
              file(s) · {{ pullKeySel.length }} of
              {{ pullPreview.candidates.length }} change(s) selected
            </span>
          </p>
          <p class="text-xs text-muted">
            Remote {{ pullPreview.commitSha.slice(0, 8) }} · expires
            {{ formatTime(pullPreview.expiresAt) }}
          </p>
          <p class="text-xs">
            Apply pull publishes Git's text for the ticked rows. A key with an
            open conflict can't be ticked in any locale until it is resolved on
            the right; everything else can be applied now.
          </p>
        </div>
        <div class="ml-auto shrink-0 flex items-center gap-2">
          <span v-if="status?.syncingBy" class="text-xs text-warning">
            {{ status.syncingBy }} is syncing — apply once it finishes
          </span>
          <UButton
            color="neutral"
            variant="ghost"
            :disabled="applying"
            @click="cancelPreview"
          >
            Cancel
          </UButton>
          <UButton
            color="info"
            :loading="applying"
            :disabled="!pullCanConfirm"
            @click="confirmPull"
          >
            Apply pull
          </UButton>
        </div>
      </div>

      <div
        v-else-if="pushPreview"
        class="shrink-0 px-6 py-2 bg-primary/10 border-b border-primary/30 flex flex-wrap items-center gap-3"
      >
        <div class="min-w-0">
          <p class="text-sm font-medium">
            Review push
            <span class="font-normal text-muted">
              · {{ pushKeySel.length }} of
              {{ pushPreview.candidates.length }} source key(s) selected ({{
                pushPreview.sourceLocale
              }})
            </span>
          </p>
          <p class="text-xs text-muted">
            Expires {{ formatTime(pushPreview.expiresAt) }} · nothing is
            committed until you confirm
          </p>
          <p class="text-xs">
            Ticking a row where Git has newer text overwrites it. Rows changed
            on both sides can't be ticked — resolve them on the right first.
          </p>
        </div>
        <div class="ml-auto shrink-0 flex items-center gap-2">
          <span v-if="status?.syncingBy" class="text-xs text-warning">
            {{ status.syncingBy }} is syncing — apply once it finishes
          </span>
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

      <!-- Stacks below `lg`, like the Translations page. -->
      <div class="flex-1 min-h-0 min-w-0 flex flex-col lg:flex-row">
        <GitReviewList
          class="max-h-[45%] lg:max-h-none lg:w-96 shrink-0 border-b lg:border-b-0 lg:border-r border-default"
          :focused="activeItem?.id ?? null"
          :items="reviewItems"
          :selected-ids="reviewSelectedIds"
          :selectable="reviewMode !== 'conflicts'"
          :header-checked="reviewHeaderChecked"
          :empty-text="reviewEmptyText"
          @update:focused="focusedId = $event"
          @toggle="onReviewToggle"
          @toggle-all="onReviewToggleAll"
        />
        <main class="flex-1 min-h-0 min-w-0 flex flex-col bg-default">
          <div class="flex-1 min-h-0 overflow-auto">
            <GitReviewDetail
              v-model:compare="showCompare"
              v-model:busy="detailBusy"
              :item="activeItem"
              :conflict="activeConflict"
              :sections="activeSections"
              :resolving="resolvingId === activeConflict?.id"
              @resolve="resolve"
            />
          </div>
          <footer
            class="shrink-0 flex flex-wrap items-center justify-end gap-x-4 gap-y-1 px-4 py-2 border-t border-default text-xs text-muted"
          >
            <span class="flex items-center gap-1">
              <UKbd>↑</UKbd><UKbd>↓</UKbd> Switch row
            </span>
            <span class="flex items-center gap-1">
              <UKbd>C</UKbd> Compare
            </span>
            <span v-if="reviewMode !== 'conflicts'" class="flex items-center gap-1">
              <UKbd>X</UKbd> Select row
            </span>
            <template v-if="activeConflict">
              <span class="flex items-center gap-1">
                <UKbd>G</UKbd> Use Git
              </span>
              <span class="flex items-center gap-1">
                <UKbd>P</UKbd> Use platform
              </span>
            </template>
          </footer>
        </main>
      </div>

      <GitSyncSettingsSlideover
        v-if="isSteward"
        v-model:open="showSettings"
        v-model:form="form"
        :credential-items="credentialItems"
        :product-items="productItems"
        :discovering="discovering"
        :can-discover="canDiscover"
        :saving="saving"
        @load-products="loadProducts"
        @normalize-url="applyNormalizedRemoteUrl"
        @save="saveBinding"
      />
    </template>
  </div>
</template>
