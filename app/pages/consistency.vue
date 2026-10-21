<script setup lang="ts">
import { watchDebounced } from '@vueuse/core'
import { validID } from '#shared/utils'
import {
  CATEGORY_ORDER,
  categorySections,
  findingKey,
  findingLocales,
  isReportFilterActive,
  REPORT_PAGE_MAX,
  REPORT_PAGE_SIZE,
  reportQueryNeedle,
  ruleCopy,
  scopeOfCategory,
  scopeSections,
  SEVERITY_ORDER,
  type FindingCategory,
  type FindingSeverity,
  type ReportFilter,
  type ReportFinding,
  type ScanStatus,
} from '#shared/utils/consistency'

definePageMeta({ middleware: ['protected'], ssr: false })

/** One category under the filter: its total and the rows loaded so far. */
type CategoryPage = {
  category: FindingCategory
  total: number
  worst: FindingSeverity
  findings: ReportFinding[]
}

type ConsistencyReport = {
  sourceLocale: string
  scannedKeys: number
  scannedAt: string
  durationMs: number
  /** Active findings, unfiltered; `counts` splits them by severity. */
  total: number
  counts: Record<FindingSeverity, number>
  ignoredCount: number
  facets: { locales: string[]; ruleIds: string[] }
  categories: CategoryPage[]
}

type ConsistencyResponse = {
  /** The latest scan snapshot; null before the project's first scan. */
  report: ConsistencyReport | null
  outdated: boolean
  scan: ScanStatus
}

type FindingsPage = { findings: ReportFinding[]; total: number }

const SCAN_POLL_MS = 1000

/**
 * Outdated reports rescan on their own, but only this many times in a row:
 * a project edited during every scan must not keep the server busy forever.
 * Re-check and a change from the drawer reset it.
 */
const MAX_AUTO_RESCANS = 3

const SEARCH_DEBOUNCE_MS = 300

/** What each scope's header icon stands for; text lives in `scopeSections`. */
const SCOPE_ICON: Record<(typeof scopeSections)[number]['id'], string> = {
  dictionary: 'i-lucide:book-open',
  published: 'i-lucide:eye',
}

const MAX_LOCALE_BADGES = 3

const projectStore = useProjectStore()
const { curProject } = storeToRefs(projectStore)
const projectId = computed(() => curProject.value?.id)

const { state: license, load: loadLicense } = useLicenseState()

const { $dayjs } = useNuxtApp()

const loading = ref(false)
const report = ref<ConsistencyReport | null>(null)
const outdated = ref(false)
const scan = ref<ScanStatus>({ state: 'idle' })
const scanning = computed(() => scan.value.state === 'running')

const locked = computed(() => license.value != null && !license.value.plus)

function severityMeta(severity: FindingSeverity) {
  return severity === 'error'
    ? { color: 'error' as const, label: 'Error' }
    : severity === 'warning'
      ? { color: 'warning' as const, label: 'Warning' }
      : { color: 'neutral' as const, label: 'Info' }
}

function ruleLabel(ruleId: string) {
  return ruleCopy[ruleId]?.label ?? ruleId
}

// ── Filters ────────────────────────────────────────────────────────────────

const filter = reactive<ReportFilter>({
  severities: [],
  locales: [],
  ruleIds: [],
  query: '',
})
const filterActive = computed(() => isReportFilterActive(filter))

function clearFilter() {
  filter.severities = []
  filter.locales = []
  filter.ruleIds = []
  filter.query = ''
}

function toggleSeverity(severity: FindingSeverity) {
  filter.severities = filter.severities.includes(severity)
    ? filter.severities.filter((s) => s !== severity)
    : [...filter.severities, severity]
}

/** The filter as the report endpoints read it; empty axes are left out. */
function filterQuery() {
  const query: Record<string, string> = {}
  if (filter.severities.length) query.severities = filter.severities.join(',')
  if (filter.locales.length) query.locales = filter.locales.join(',')
  if (filter.ruleIds.length) query.ruleIds = filter.ruleIds.join(',')
  const needle = reportQueryNeedle(filter.query)
  if (needle) query.q = needle
  return query
}

const groups = computed(() => report.value?.categories ?? [])
const matched = computed(() =>
  groups.value.reduce((sum, group) => sum + group.total, 0),
)

const localeItems = computed(() =>
  (report.value?.facets.locales ?? []).map((locale) => ({
    label: locale,
    value: locale,
  })),
)
const ruleItems = computed(() =>
  (report.value?.facets.ruleIds ?? [])
    .map((ruleId) => ({ label: ruleLabel(ruleId), value: ruleId }))
    .sort((a, b) => a.label.localeCompare(b.label)),
)

// ── Selection & paging ─────────────────────────────────────────────────────

const selectedKey = ref<string | null>(null)
const openState = ref<Record<string, boolean>>({})
const moreLoading = ref<FindingCategory | null>(null)

const categoryNodeId = (category: FindingCategory) => `category:${category}`

/** Only real user choices are stored; info-only categories start collapsed. */
function isCategoryOpen(group: CategoryPage) {
  return openState.value[categoryNodeId(group.category)] ?? group.worst !== 'info'
}

function toggleCategory(group: CategoryPage) {
  openState.value[categoryNodeId(group.category)] = !isCategoryOpen(group)
}

/** Keyboard order: the loaded rows, category by category. */
const navigable = computed(() => groups.value.flatMap((group) => group.findings))

const selected = computed(() => {
  const key = selectedKey.value
  if (!key) return null
  return navigable.value.find((f) => findingKey(f) === key) ?? null
})

function remainingOf(group: CategoryPage) {
  return Math.max(0, group.total - group.findings.length)
}

/** Next page of one category; rows a reload already brought are skipped. */
async function showMore(group: CategoryPage) {
  const id = projectId.value
  if (!validID(id) || moreLoading.value) return
  const seq = reportSeq
  moreLoading.value = group.category
  try {
    const data = await useApi<FindingsPage>(
      `/api/projects/${id}/consistency/findings`,
      {
        query: {
          ...filterQuery(),
          category: group.category,
          offset: group.findings.length,
          limit: REPORT_PAGE_SIZE,
        },
      },
    )
    if (seq !== reportSeq || id !== projectId.value) return
    const target = groups.value.find((g) => g.category === group.category)
    if (!target) return
    const seen = new Set(target.findings.map(findingKey))
    target.findings.push(...data.findings.filter((f) => !seen.has(findingKey(f))))
    target.total = data.total
  } finally {
    moreLoading.value = null
  }
}

/** Keep a selection whenever anything is visible; advance past ignores. */
function syncSelection(preferKey?: string) {
  const list = navigable.value
  if (preferKey && list.some((f) => findingKey(f) === preferKey)) {
    selectedKey.value = preferKey
    return
  }
  const current = selectedKey.value
  if (current && list.some((f) => findingKey(f) === current)) return
  selectedKey.value = list.length ? findingKey(list[0]!) : null
}

function select(finding: ReportFinding) {
  selectedKey.value = findingKey(finding)
}

/**
 * ↓ on the last loaded row of a category with more on the server loads the
 * next page first, so the cursor walks the category rather than skipping it.
 */
async function moveSelection(delta: number) {
  const current = selected.value
  const group = current
    ? groups.value.find((g) => g.category === current.category)
    : undefined
  if (
    delta > 0 &&
    current &&
    group &&
    remainingOf(group) &&
    findingKey(group.findings.at(-1)!) === findingKey(current)
  ) {
    const before = group.findings.length
    await showMore(group)
    const after = groups.value.find((g) => g.category === current.category)
    if (!after || after.findings.length === before) return
  }
  const list = navigable.value
  if (!list.length) return
  const index = list.findIndex((f) => findingKey(f) === selectedKey.value)
  const next = Math.min(
    Math.max((index === -1 ? 0 : index) + delta, 0),
    list.length - 1,
  )
  const target = list[next]
  if (target) {
    select(target)
    await nextTick()
    document
      .querySelector(`[data-finding-key="${findingKey(target)}"]`)
      ?.scrollIntoView({ block: 'nearest' })
  }
}

function onKeydown(event: KeyboardEvent) {
  const target = event.target as HTMLElement | null
  if (
    target &&
    (target.tagName === 'INPUT' ||
      target.tagName === 'TEXTAREA' ||
      target.isContentEditable)
  ) {
    return
  }
  if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
    event.preventDefault()
    void moveSelection(event.key === 'ArrowDown' ? 1 : -1)
  } else if (event.key === 'e' && selected.value) {
    event.preventDefault()
    setIgnored(selected.value, true)
  }
}

onMounted(() => window.addEventListener('keydown', onKeydown))
onUnmounted(() => window.removeEventListener('keydown', onKeydown))

// ── Data ───────────────────────────────────────────────────────────────────

let scanTimer: ReturnType<typeof setTimeout> | null = null
let autoRescans = 0
/** Bumped per report request; an older response is dropped. */
let reportSeq = 0
/** The filter the shown report was asked for, so a no-op change skips it. */
let lastFilterKey = ''

function stopScanWatch() {
  if (scanTimer) clearTimeout(scanTimer)
  scanTimer = null
}

function filterKey() {
  return JSON.stringify(filterQuery())
}

/** Loaded rows per category beyond the first page — a reload keeps them. */
function keptLimits() {
  return groups.value
    .filter((group) => group.findings.length > REPORT_PAGE_SIZE)
    .map(
      (group) =>
        `${group.category}:${Math.min(group.findings.length, REPORT_PAGE_MAX)}`,
    )
    .join(',')
}

/**
 * Reads the snapshot; never scans by itself. An outdated or missing snapshot
 * starts a background scan (bounded by MAX_AUTO_RESCANS) and the stale
 * findings stay on screen until the new ones land. `keep` asks for as many
 * rows per category as are shown now; a new filter starts from page one.
 */
async function loadReport(keep = true) {
  const id = projectId.value
  if (!validID(id) || locked.value) return
  const seq = ++reportSeq
  lastFilterKey = filterKey()
  const limits = keep ? keptLimits() : ''
  const data = await useApi<ConsistencyResponse>(
    `/api/projects/${id}/consistency`,
    { query: { ...filterQuery(), ...(limits ? { limits } : {}) } },
  )
  if (seq !== reportSeq || id !== projectId.value) return
  report.value = data.report
  outdated.value = data.outdated
  scan.value = data.scan
  syncSelection()
  if (ignoredList.value) void loadIgnored()
  if (data.scan.state === 'running') {
    watchScan()
  } else if (
    data.outdated &&
    data.scan.state === 'idle' &&
    autoRescans < MAX_AUTO_RESCANS
  ) {
    autoRescans += 1
    await startScan()
  }
}

function reloadForFilter() {
  if (loading.value || !report.value || filterKey() === lastFilterKey) return
  void loadReport(false)
}

watch(
  () => [filter.severities, filter.locales, filter.ruleIds],
  reloadForFilter,
)
watchDebounced(() => filter.query, reloadForFilter, {
  debounce: SEARCH_DEBOUNCE_MS,
})

async function startScan() {
  const id = projectId.value
  if (!validID(id)) return
  stopScanWatch()
  const status = await useApi<ScanStatus>(
    `/api/projects/${id}/consistency/scan`,
    { method: 'POST' },
  )
  if (id !== projectId.value) return
  scan.value = status
  watchScan()
}

function recheck() {
  autoRescans = 0
  void startScan()
}

/** Polls a running scan; once it stops, the report reloads from the snapshot. */
function watchScan() {
  stopScanWatch()
  const id = projectId.value
  if (!validID(id)) return
  scanTimer = setTimeout(async () => {
    scanTimer = null
    try {
      const status = await useApi<ScanStatus>(
        `/api/projects/${id}/consistency/scan`,
      )
      if (id !== projectId.value) return
      scan.value = status
    } catch {
      if (id === projectId.value) watchScan()
      return
    }
    if (scan.value.state === 'running') {
      watchScan()
    } else {
      await loadReport()
    }
  }, SCAN_POLL_MS)
}

async function load() {
  loading.value = true
  report.value = null
  ignoredList.value = null
  outdated.value = false
  scan.value = { state: 'idle' }
  stopScanWatch()
  try {
    if (!license.value) await loadLicense()
    await loadReport(false)
  } finally {
    loading.value = false
  }
}

onMounted(load)
onUnmounted(stopScanWatch)
watch(
  () => projectId.value,
  () => {
    openState.value = {}
    selectedKey.value = null
    autoRescans = 0
    clearFilter()
    load()
  },
)

// ── Whitelist ──────────────────────────────────────────────────────────────

/** "Marked not an issue", fetched when that section first opens. */
const ignoredList = ref<ReportFinding[] | null>(null)
const ignoredTotal = ref(0)
const ignoredLoading = ref(false)

/** Reloads the rows shown so far, or appends the next page with `more`. */
async function loadIgnored(more = false) {
  const id = projectId.value
  if (!validID(id)) return
  const loaded = ignoredList.value?.length ?? 0
  ignoredLoading.value = true
  try {
    const data = await useApi<FindingsPage>(
      `/api/projects/${id}/consistency/ignored`,
      {
        query: more
          ? { offset: loaded, limit: REPORT_PAGE_SIZE }
          : {
              offset: 0,
              limit: Math.min(Math.max(loaded, REPORT_PAGE_SIZE), REPORT_PAGE_MAX),
            },
      },
    )
    if (id !== projectId.value) return
    if (more && ignoredList.value) {
      const seen = new Set(ignoredList.value.map(findingKey))
      ignoredList.value.push(...data.findings.filter((f) => !seen.has(findingKey(f))))
    } else {
      ignoredList.value = data.findings
    }
    ignoredTotal.value = data.total
  } finally {
    ignoredLoading.value = false
  }
}

function onIgnoredOpen(open: boolean) {
  if (open && !ignoredList.value) void loadIgnored()
}

/**
 * Drops a finding from the active list and keeps the cursor where it was —
 * the next row moves up into the gap.
 */
function removeFinding(finding: ReportFinding) {
  const current = report.value
  if (!current) return
  const key = findingKey(finding)
  const index = navigable.value.findIndex((f) => findingKey(f) === key)
  const group = current.categories.find((g) => g.category === finding.category)
  if (group && group.findings.some((f) => findingKey(f) === key)) {
    group.findings = group.findings.filter((f) => findingKey(f) !== key)
    group.total = Math.max(0, group.total - 1)
    current.total = Math.max(0, current.total - 1)
    current.counts[finding.severity] = Math.max(
      0,
      current.counts[finding.severity] - 1,
    )
    if (!group.total) {
      current.categories = current.categories.filter((g) => g !== group)
    }
  }
  const next = navigable.value
  const target = next[Math.min(index, next.length - 1)]
  selectedKey.value = target ? findingKey(target) : null
  syncSelection()
}

async function setIgnored(finding: ReportFinding, ignored: boolean) {
  if (!validID(projectId.value) || !report.value) return
  try {
    await useApi(`/api/projects/${projectId.value}/consistency/ignore`, {
      method: 'POST',
      body: { ruleId: finding.ruleId, groupId: finding.groupId, ignored },
    })
  } catch {
    // Not in the latest snapshot any more (409): reload it.
    await load()
    return
  }
  const current = report.value
  if (ignored) {
    removeFinding(finding)
    current.ignoredCount += 1
    if (ignoredList.value) {
      ignoredList.value.push(finding)
      ignoredTotal.value += 1
    }
  } else {
    const key = findingKey(finding)
    if (ignoredList.value) {
      ignoredList.value = ignoredList.value.filter((f) => findingKey(f) !== key)
      ignoredTotal.value = Math.max(0, ignoredTotal.value - 1)
    }
    current.ignoredCount = Math.max(0, current.ignoredCount - 1)
    // Back into its sorted place under the current filter.
    await loadReport()
  }
}

/**
 * The drawer wrote a fix or merge for the selected finding. Take it off the
 * list right away and recheck its keys' single-key rules on the server: an
 * unresolved mismatch comes straight back. The reload then sees the report
 * outdated and starts the full scan for duplicates.
 */
async function onFindingChanged(finding: ReportFinding) {
  removeFinding(finding)
  outdated.value = true
  autoRescans = 0
  const id = projectId.value
  try {
    await useApi(`/api/projects/${id}/consistency/recheck-keys`, {
      method: 'POST',
      body: { keyIds: finding.keys.map((member) => member.keyId) },
    })
  } catch {
    if (id === projectId.value) await startScan()
    return
  }
  if (id !== projectId.value) return
  await loadReport()
}

function scanLabel(status: ScanStatus) {
  switch (status.state) {
    case 'idle':
      return ''
    case 'failed':
      return 'Scan failed'
    case 'running':
      switch (status.phase) {
        case 'loading':
          return 'Reading keys…'
        case 'checking':
          return `Checking rules ${status.done}/${status.total}`
        case 'saving':
          return 'Saving results…'
        default: {
          const unknown: never = status.phase
          return unknown
        }
      }
    default: {
      const unknown: never = status
      return unknown
    }
  }
}

function headline(finding: ReportFinding) {
  const lead = finding.keys[0]
  if (!lead) return ''
  if (finding.category === 'duplicate') return `“${lead.sourceText}”`
  return lead.key
}

</script>

<template>
  <div class="h-full min-w-0 flex flex-col bg-muted">
    <header
      class="shrink-0 px-6 py-5 bg-default border-b border-default flex items-center gap-3"
    >
      <h1 class="text-xl font-semibold tracking-tight">Consistency</h1>
      <span class="text-sm text-muted truncate">{{ curProject?.name }}</span>

      <div
        v-if="validID(projectId) && !locked && !loading"
        class="ml-auto shrink-0 flex items-center gap-3"
      >
        <div
          v-if="scan.state === 'running'"
          class="flex items-center gap-2 text-xs text-muted"
        >
          <UIcon name="i-lucide:loader-circle" class="size-3.5 animate-spin" />
          <span class="tabular-nums">{{ scanLabel(scan) }}</span>
          <UProgress
            v-if="scan.phase === 'checking' && scan.total"
            :model-value="scan.done"
            :max="scan.total"
            size="xs"
            class="w-24"
          />
        </div>
        <UTooltip v-else-if="scan.state === 'failed'" :text="scan.error">
          <UBadge color="error" variant="subtle" icon="i-lucide:circle-alert">
            Scan failed
          </UBadge>
        </UTooltip>
        <UTooltip
          v-else-if="report && outdated"
          text="Keys, translations, tags or Consistency settings changed since this scan."
        >
          <UBadge color="warning" variant="subtle" icon="i-lucide:clock-alert">
            Outdated
          </UBadge>
        </UTooltip>
        <span v-if="report" class="text-xs text-dimmed tabular-nums">
          Scanned {{ $dayjs(report.scannedAt).format('YYYY-MM-DD HH:mm') }}
        </span>
        <UButton
          size="sm"
          color="neutral"
          variant="soft"
          icon="i-lucide:refresh-cw"
          :loading="scanning"
          :disabled="scanning"
          @click="recheck"
        >
          Re-check
        </UButton>
      </div>
    </header>

    <UAlert
      v-if="!validID(projectId)"
      color="neutral"
      variant="subtle"
      title="Select a project"
      description="Pick a project in the workspace bar to scan its dictionary."
      class="m-6"
    />

    <template v-else-if="locked">
      <div class="p-6 flex flex-col gap-4 overflow-auto">
        <UAlert
          color="warning"
          variant="subtle"
          title="Plus feature"
          description="Consistency scans every key of the project for duplicate text and translation mismatches — findings stay hidden on the free tier. Ask your administrator to enable Plus."
        />

        <section
          v-for="category in CATEGORY_ORDER"
          :key="category"
          class="flex flex-col gap-2"
        >
          <h2 class="text-sm font-semibold flex items-center gap-1.5">
            <UIcon
              :name="SCOPE_ICON[scopeOfCategory(category).id]"
              class="size-3.5 text-muted"
            />
            {{ categorySections[category].title }}
            <span class="text-xs font-normal text-muted">
              · {{ scopeOfCategory(category).title }}
            </span>
          </h2>
          <p class="text-sm text-muted">
            {{ categorySections[category].description }}
          </p>
        </section>

        <section class="flex flex-col gap-1 border-t border-default pt-4">
          <h2 class="text-sm font-semibold text-muted">More checks coming</h2>
          <p class="text-xs text-muted">
            Semantic similarity · Design vs dictionary
          </p>
        </section>
      </div>
    </template>

    <div v-else-if="loading" class="p-6 text-sm text-muted">Loading…</div>

    <div v-else-if="!report" class="p-6 flex flex-col gap-3 max-w-xl">
      <UAlert
        v-if="scan.state === 'failed'"
        color="error"
        variant="subtle"
        icon="i-lucide:circle-alert"
        title="The scan failed"
        :description="scan.error"
        :actions="[{ label: 'Retry', color: 'error', variant: 'soft', onClick: recheck }]"
      />
      <template v-else>
        <p class="text-sm flex items-center gap-2">
          <UIcon name="i-lucide:loader-circle" class="size-4 animate-spin" />
          First scan of this project — {{ scanLabel(scan) || 'starting…' }}
        </p>
        <UProgress
          v-if="scan.state === 'running' && scan.phase === 'checking' && scan.total"
          :model-value="scan.done"
          :max="scan.total"
          size="sm"
        />
        <p class="text-xs text-muted">
          Scans run in the background; later visits open the saved result at
          once.
        </p>
      </template>
    </div>

    <template v-else-if="report">
      <div
        v-if="report.total"
        class="shrink-0 px-6 py-3 bg-default border-b border-default flex flex-wrap items-center gap-2"
      >
        <div class="flex items-center gap-1">
          <UButton
            v-for="severity in SEVERITY_ORDER"
            :key="severity"
            size="xs"
            :color="severityMeta(severity).color"
            :variant="filter.severities.includes(severity) ? 'soft' : 'ghost'"
            :disabled="
              !report.counts[severity] && !filter.severities.includes(severity)
            "
            @click="toggleSeverity(severity)"
          >
            {{ severityMeta(severity).label }}
            <span class="tabular-nums opacity-70">{{
              report.counts[severity]
            }}</span>
          </UButton>
        </div>
        <USelectMenu
          v-model="filter.locales"
          :items="localeItems"
          value-key="value"
          multiple
          placeholder="All languages"
          size="sm"
          class="w-40"
        />
        <USelectMenu
          v-model="filter.ruleIds"
          :items="ruleItems"
          value-key="value"
          multiple
          placeholder="All rules"
          size="sm"
          class="w-48"
        />
        <UInput
          v-model="filter.query"
          icon="i-lucide:search"
          placeholder="Search key or text"
          size="sm"
          class="w-56"
        />
        <UButton
          v-if="filterActive"
          size="xs"
          color="neutral"
          variant="link"
          @click="clearFilter"
        >
          Clear filters
        </UButton>
      </div>

      <!-- Review workspace: compact list left, the selected finding right. -->
      <div class="flex-1 min-h-0 flex flex-col lg:flex-row">
        <aside
          class="lg:w-96 shrink-0 border-b lg:border-b-0 lg:border-r border-default overflow-auto"
        >
          <div
            v-if="report.total"
            class="px-4 py-3 bg-elevated/40 border-b border-default flex flex-col gap-1.5"
          >
            <div
              class="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted"
            >
              <span class="inline-flex items-center gap-1">
                <UIcon name="i-lucide:key-round" class="size-3.5" />
                <span class="tabular-nums">{{ report.scannedKeys }}</span>
                keys
              </span>
              <span class="inline-flex items-center gap-1">
                <UIcon name="i-lucide:languages" class="size-3.5" />
                <span class="uppercase">
                  {{ report.sourceLocale }} 
                </span>
                source language 
              </span>
              <span v-if="filterActive" class="inline-flex items-center gap-1">
                <UIcon name="i-lucide:list-filter" class="size-3.5" />
                <span class="tabular-nums">
                  {{ matched }}/{{ report.total }}
                </span>
                shown
              </span>
            </div>
            <p
              class="text-[11px] text-dimmed flex flex-wrap items-center gap-x-3 gap-y-0.5"
            >
              <span class="uppercase tracking-wide">Scope</span>
              <UTooltip
                v-for="scope in scopeSections"
                :key="scope.id"
                :text="scope.description"
              >
                <span class="inline-flex items-center gap-1">
                  <UIcon :name="SCOPE_ICON[scope.id]" class="size-3" />
                  {{ scope.title }}
                </span>
              </UTooltip>
            </p>
          </div>
          <p
            v-else
            class="px-4 py-3 text-sm text-muted border-b border-default"
          >
            No findings — scanned {{ report.scannedKeys }} keys in
            {{ report.sourceLocale }}.
          </p>

          <div
            v-if="filterActive && !groups.length"
            class="m-4 rounded-xl border border-dashed border-default px-4 py-6 text-center text-sm text-muted"
          >
            No findings match these filters.
            <UButton
              size="xs"
              color="neutral"
              variant="link"
              @click="clearFilter"
            >
              Clear filters
            </UButton>
          </div>

          <div v-for="group in groups" :key="group.category" class="pt-3">
            <button
              type="button"
              class="w-full px-4 py-1.5 flex items-center gap-2 text-left hover:bg-elevated/50"
              :aria-expanded="isCategoryOpen(group)"
              @click="toggleCategory(group)"
            >
              <UIcon
                name="i-lucide:chevron-right"
                class="size-3.5 shrink-0 text-muted transition-transform"
                :class="isCategoryOpen(group) && 'rotate-90'"
              />
              <UTooltip
                :text="`${scopeOfCategory(group.category).title} — ${scopeOfCategory(group.category).description}`"
              >
                <UIcon
                  :name="SCOPE_ICON[scopeOfCategory(group.category).id]"
                  class="size-3.5 shrink-0 text-muted"
                  :aria-label="scopeOfCategory(group.category).title"
                />
              </UTooltip>
              <span
                class="text-xs font-semibold uppercase tracking-wider text-highlighted"
              >
                {{ categorySections[group.category].title }}
              </span>
              <UBadge
                :color="severityMeta(group.worst).color"
                variant="subtle"
                size="xs"
              >
                {{ group.total }}
              </UBadge>
            </button>

            <template v-if="isCategoryOpen(group)">
              <button
                v-for="finding in group.findings"
                :key="findingKey(finding)"
                type="button"
                :data-finding-key="findingKey(finding)"
                class="w-full flex items-center gap-2 px-4 py-1.5 min-h-9 text-left rounded-md border transition-colors"
                :class="
                  selectedKey === findingKey(finding)
                    ? 'border-primary bg-primary/10'
                    : 'border-transparent hover:bg-elevated/50'
                "
                @click="select(finding)"
              >
                <span
                  class="size-2 rounded-full shrink-0"
                  :class="
                    severityMeta(finding.severity).color === 'error'
                      ? 'bg-error'
                      : severityMeta(finding.severity).color === 'warning'
                        ? 'bg-warning'
                        : 'bg-accented'
                  "
                  :title="finding.severity"
                />
                <span
                  v-if="finding.category !== 'duplicate'"
                  class="text-xs text-muted shrink-0 max-w-[35%] truncate"
                >
                  {{ ruleLabel(finding.ruleId) }}
                </span>
                <span class="text-sm truncate min-w-0">
                  {{ headline(finding) }}
                </span>
                <span
                  v-if="finding.category === 'duplicate'"
                  class="text-xs text-muted shrink-0"
                >
                  {{ finding.keys.length }} keys
                </span>
                <span class="flex items-center gap-1 shrink-0 ml-auto">
                  <UBadge
                    v-for="locale in findingLocales(finding).slice(
                      0,
                      MAX_LOCALE_BADGES,
                    )"
                    :key="locale"
                    color="neutral"
                    variant="outline"
                    size="xs"
                  >
                    {{ locale }}
                  </UBadge>
                  <span
                    v-if="findingLocales(finding).length > MAX_LOCALE_BADGES"
                    class="text-xs text-muted"
                  >
                    +{{ findingLocales(finding).length - MAX_LOCALE_BADGES }}
                  </span>
                  <UTooltip
                    text="Not an issue — hidden until its keys or translations change"
                  >
                    <UButton
                      size="xs"
                      color="neutral"
                      variant="ghost"
                      icon="i-lucide:check-check"
                      aria-label="Not an issue"
                      @click.stop="setIgnored(finding, true)"
                    />
                  </UTooltip>
                </span>
              </button>

              <div v-if="remainingOf(group)" class="px-4 py-1.5">
                <UButton
                  size="xs"
                  color="neutral"
                  variant="ghost"
                  icon="i-lucide:chevrons-down"
                  :loading="moreLoading === group.category"
                  @click="showMore(group)"
                >
                  Show more ·
                  {{ remainingOf(group) }}
                  left
                </UButton>
              </div>
            </template>
          </div>

          <UCollapsible
            v-if="report.ignoredCount"
            class="border-t border-default mt-2"
            @update:open="onIgnoredOpen"
          >
            <template #default="{ open }">
              <button
                type="button"
                class="w-full flex items-center gap-2 px-4 py-2 text-left"
              >
                <UIcon
                  name="i-lucide:chevron-right"
                  class="size-4 shrink-0 text-muted transition-transform"
                  :class="open && 'rotate-90'"
                />
                <span class="text-sm font-semibold text-muted">
                  Marked not an issue
                </span>
                <span class="text-xs text-muted">
                  {{ report.ignoredCount }}
                </span>
              </button>
            </template>
            <template #content>
              <div class="flex flex-col gap-1 px-4 pb-3">
                <p v-if="!ignoredList" class="text-xs text-muted px-3 py-1.5">
                  Loading…
                </p>
                <div
                  v-for="finding in ignoredList ?? []"
                  :key="findingKey(finding)"
                  class="rounded-lg bg-elevated/50 px-3 py-1.5 flex items-center gap-2"
                >
                  <span class="text-xs text-muted shrink-0">
                    {{ ruleLabel(finding.ruleId) }}
                  </span>
                  <span class="text-sm truncate">
                    {{ headline(finding) }}
                  </span>
                  <UButton
                    size="xs"
                    color="neutral"
                    variant="ghost"
                    icon="i-lucide:rotate-ccw"
                    class="ml-auto shrink-0"
                    @click="setIgnored(finding, false)"
                  >
                    Restore
                  </UButton>
                </div>
                <UButton
                  v-if="ignoredList && ignoredList.length < ignoredTotal"
                  size="xs"
                  color="neutral"
                  variant="ghost"
                  icon="i-lucide:chevrons-down"
                  class="self-start"
                  :loading="ignoredLoading"
                  @click="loadIgnored(true)"
                >
                  Show more ·
                  {{ ignoredTotal - ignoredList.length }}
                  left
                </UButton>
              </div>
            </template>
          </UCollapsible>

          <section
            class="m-4 rounded-lg border border-dashed border-default px-3 py-2 flex items-start gap-2 text-dimmed"
          >
            <UIcon name="i-lucide:sparkles" class="size-3.5 mt-0.5 shrink-0" />
            <div class="flex flex-col">
              <h2 class="text-xs font-medium">More checks coming</h2>
              <p class="text-[11px] italic">
                Semantic similarity · Design vs dictionary
              </p>
            </div>
          </section>
        </aside>

        <main class="flex-1 min-w-0 overflow-auto bg-default">
          <ConsistencyFindingDetail
            v-if="selected"
            :finding="selected"
            :locales="filter.locales"
            :project-id="projectId"
            @ignore="setIgnored(selected, true)"
            @changed="onFindingChanged(selected)"
          />
          <div
            v-else
            class="h-full flex flex-col items-center justify-center gap-2 text-muted p-6"
          >
            <UIcon name="i-lucide:mouse-pointer-click" class="size-8" />
            <p class="text-sm">Select a finding to review it here.</p>
            <p class="text-xs">
              ↑ ↓ browse · e not an issue — Resolve opens the design and the fix
              in a drawer.
            </p>
          </div>
        </main>
      </div>
    </template>
  </div>
</template>
