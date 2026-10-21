<script setup lang="ts">
import { validID } from '#shared/utils'
import {
  categorySections,
  findingKey,
  findingLocales,
  groupReport,
  isReportFilterActive,
  matchesReportFilter,
  ruleCopy,
  scopeOfCategory,
  scopeSections,
  severityCounts,
  worstSeverity,
  type FindingCategory,
  type FindingSeverity,
  type ReportFilter,
  type ReportFinding,
  type ScanStatus,
} from '#shared/utils/consistency'

definePageMeta({ middleware: ['protected'], ssr: false })

type ConsistencyReport = {
  sourceLocale: string
  scannedKeys: number
  scannedAt: string
  durationMs: number
  findings: ReportFinding[]
  ignored: ReportFinding[]
}

type ConsistencyResponse = {
  /** The latest scan snapshot; null before the project's first scan. */
  report: ConsistencyReport | null
  outdated: boolean
  scan: ScanStatus
}

const SCAN_POLL_MS = 1000

/**
 * Outdated reports rescan on their own, but only this many times in a row:
 * a project edited during every scan must not keep the server busy forever.
 * Re-check and a change from the drawer reset it.
 */
const MAX_AUTO_RESCANS = 3

/** Registry order = report order; titles/descriptions come from the registry. */
const CATEGORY_ORDER: FindingCategory[] = [
  'duplicate',
  'mismatch',
  'lint',
  'orphan',
]

/** What each scope's header icon stands for; text lives in `scopeSections`. */
const SCOPE_ICON: Record<(typeof scopeSections)[number]['id'], string> = {
  dictionary: 'i-lucide:book-open',
  published: 'i-lucide:eye',
}

const SEVERITIES: FindingSeverity[] = ['error', 'warning', 'info']

/** Rows listed per category before "Show more". */
const PAGE_SIZE = 20

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

const allFindings = computed(() => report.value?.findings ?? [])
const visibleFindings = computed(() =>
  allFindings.value.filter((finding) => matchesReportFilter(finding, filter)),
)
const groups = computed(() =>
  groupReport(visibleFindings.value, CATEGORY_ORDER),
)
const counts = computed(() => severityCounts(allFindings.value))

const localeItems = computed(() =>
  [...new Set(allFindings.value.flatMap(findingLocales))]
    .sort()
    .map((locale) => ({ label: locale, value: locale })),
)
const ruleItems = computed(() =>
  [...new Set(allFindings.value.map((finding) => finding.ruleId))]
    .map((ruleId) => ({ label: ruleLabel(ruleId), value: ruleId }))
    .sort((a, b) => a.label.localeCompare(b.label)),
)

// ── Selection & paging ─────────────────────────────────────────────────────

const selectedKey = ref<string | null>(null)
const shownState = ref<Record<string, number>>({})
const openState = ref<Record<string, boolean>>({})

const categoryNodeId = (category: FindingCategory) => `category:${category}`

/** Only real user choices are stored; info-only categories start collapsed. */
function categoryDefaultOpen(findings: ReportFinding[]) {
  return worstSeverity(findings) !== 'info'
}

function isCategoryOpen(category: FindingCategory, findings: ReportFinding[]) {
  return (
    openState.value[categoryNodeId(category)] ?? categoryDefaultOpen(findings)
  )
}

function toggleCategory(category: FindingCategory, findings: ReportFinding[]) {
  const id = categoryNodeId(category)
  openState.value[id] = !isCategoryOpen(category, findings)
}

const selected = computed(() => {
  const key = selectedKey.value
  if (!key) return null
  return allFindings.value.find((f) => findingKey(f) === key) ?? null
})

/** Keyboard order: what the list would render, category by category. */
const navigable = computed(() =>
  groups.value.flatMap((group) =>
    pageOf(categoryNodeId(group.category), group.findings),
  ),
)

function pageOf(id: string, findings: ReportFinding[]) {
  return findings.slice(0, shownOf(id))
}

function shownOf(id: string) {
  return shownState.value[id] ?? PAGE_SIZE
}

function showMore(id: string) {
  shownState.value[id] = shownOf(id) + PAGE_SIZE
}

function remainingOf(id: string, findings: ReportFinding[]) {
  return Math.max(0, findings.length - shownOf(id))
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

function moveSelection(delta: number) {
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
    moveSelection(event.key === 'ArrowDown' ? 1 : -1)
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

function stopScanWatch() {
  if (scanTimer) clearTimeout(scanTimer)
  scanTimer = null
}

/**
 * Reads the snapshot; never scans by itself. An outdated or missing snapshot
 * starts a background scan (bounded by MAX_AUTO_RESCANS) and the stale
 * findings stay on screen until the new ones land.
 */
async function loadReport() {
  const id = projectId.value
  if (!validID(id) || locked.value) return
  const data = await useApi<ConsistencyResponse>(
    `/api/projects/${id}/consistency`,
  )
  if (id !== projectId.value) return
  report.value = data.report
  outdated.value = data.outdated
  scan.value = data.scan
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
      syncSelection()
    }
  }, SCAN_POLL_MS)
}

async function load() {
  loading.value = true
  report.value = null
  outdated.value = false
  scan.value = { state: 'idle' }
  stopScanWatch()
  try {
    if (!license.value) await loadLicense()
    await loadReport()
    syncSelection()
  } finally {
    loading.value = false
  }
}

onMounted(load)
onUnmounted(stopScanWatch)
watch(
  () => projectId.value,
  () => {
    shownState.value = {}
    openState.value = {}
    selectedKey.value = null
    autoRescans = 0
    clearFilter()
    load()
  },
)
watch(visibleFindings, () => syncSelection())

/**
 * Drops a finding from the active list and keeps the cursor where it was —
 * the next row moves up into the gap.
 */
function removeFinding(finding: ReportFinding) {
  const current = report.value
  if (!current) return
  const key = findingKey(finding)
  const index = navigable.value.findIndex((f) => findingKey(f) === key)
  current.findings = current.findings.filter((f) => findingKey(f) !== key)
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
    current.ignored.push(finding)
  } else {
    const key = findingKey(finding)
    current.ignored = current.ignored.filter((f) => findingKey(f) !== key)
    current.findings.push(finding)
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
  syncSelection()
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
        v-if="allFindings.length"
        class="shrink-0 px-6 py-3 bg-default border-b border-default flex flex-wrap items-center gap-2"
      >
        <div class="flex items-center gap-1">
          <UButton
            v-for="severity in SEVERITIES"
            :key="severity"
            size="xs"
            :color="severityMeta(severity).color"
            :variant="filter.severities.includes(severity) ? 'soft' : 'ghost'"
            :disabled="
              !counts[severity] && !filter.severities.includes(severity)
            "
            @click="toggleSeverity(severity)"
          >
            {{ severityMeta(severity).label }}
            <span class="tabular-nums opacity-70">{{ counts[severity] }}</span>
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
            v-if="allFindings.length"
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
                  {{ visibleFindings.length }}/{{ allFindings.length }}
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
            v-if="filterActive && !visibleFindings.length"
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
              :aria-expanded="isCategoryOpen(group.category, group.findings)"
              @click="toggleCategory(group.category, group.findings)"
            >
              <UIcon
                name="i-lucide:chevron-right"
                class="size-3.5 shrink-0 text-muted transition-transform"
                :class="
                  isCategoryOpen(group.category, group.findings) && 'rotate-90'
                "
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
                :color="severityMeta(worstSeverity(group.findings)!).color"
                variant="subtle"
                size="xs"
              >
                {{ group.findings.length }}
              </UBadge>
            </button>

            <template v-if="isCategoryOpen(group.category, group.findings)">
              <button
                v-for="finding in pageOf(
                  categoryNodeId(group.category),
                  group.findings,
                )"
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

              <div
                v-if="
                  remainingOf(categoryNodeId(group.category), group.findings)
                "
                class="px-4 py-1.5"
              >
                <UButton
                  size="xs"
                  color="neutral"
                  variant="ghost"
                  icon="i-lucide:chevrons-down"
                  @click="showMore(categoryNodeId(group.category))"
                >
                  Show more ·
                  {{
                    remainingOf(categoryNodeId(group.category), group.findings)
                  }}
                  left
                </UButton>
              </div>
            </template>
          </div>

          <UCollapsible
            v-if="report.ignored.length"
            class="border-t border-default mt-2"
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
                  {{ report.ignored.length }}
                </span>
              </button>
            </template>
            <template #content>
              <div class="flex flex-col gap-1 px-4 pb-3">
                <div
                  v-for="finding in report.ignored"
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
