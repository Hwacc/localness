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
  severityCounts,
  worstSeverity,
  type FindingCategory,
  type FindingSeverity,
  type ReportFilter,
  type ReportFinding,
} from '#shared/utils/consistency'

definePageMeta({ middleware: ['protected'], ssr: false })

type ConsistencyReport = {
  sourceLocale: string
  scannedKeys: number
  findings: ReportFinding[]
  ignored: ReportFinding[]
}

/** Registry order = report order; titles/descriptions come from the registry. */
const CATEGORY_ORDER: FindingCategory[] = [
  'duplicate',
  'mismatch',
  'lint',
  'orphan',
]

const SEVERITIES: FindingSeverity[] = ['error', 'warning', 'info']

/** Rows listed per category before "Show more". */
const PAGE_SIZE = 20

const MAX_LOCALE_BADGES = 3

const projectStore = useProjectStore()
const { curProject } = storeToRefs(projectStore)
const projectId = computed(() => curProject.value?.id)

const { state: license, load: loadLicense } = useLicenseState()

const loading = ref(false)
const report = ref<ConsistencyReport | null>(null)

const locked = computed(() => license.value != null && !license.value.plus)

function severityMeta(severity: FindingSeverity) {
  return severity === 'error'
    ? {
        color: 'error' as const,
        label: 'Error',
        icon: 'i-lucide:circle-x',
        iconClass: 'text-error',
      }
    : severity === 'warning'
      ? {
          color: 'warning' as const,
          label: 'Warning',
          icon: 'i-lucide:triangle-alert',
          iconClass: 'text-warning',
        }
      : {
          color: 'neutral' as const,
          label: 'Info',
          icon: 'i-lucide:info',
          iconClass: 'text-muted',
        }
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
  allFindings.value.filter((finding) => matchesReportFilter(finding, filter))
)
const groups = computed(() => groupReport(visibleFindings.value, CATEGORY_ORDER))
const counts = computed(() => severityCounts(allFindings.value))

const localeItems = computed(() =>
  [...new Set(allFindings.value.flatMap(findingLocales))]
    .sort()
    .map((locale) => ({ label: locale, value: locale }))
)
const ruleItems = computed(() =>
  [...new Set(allFindings.value.map((finding) => finding.ruleId))]
    .map((ruleId) => ({ label: ruleLabel(ruleId), value: ruleId }))
    .sort((a, b) => a.label.localeCompare(b.label))
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
  return openState.value[categoryNodeId(category)] ?? categoryDefaultOpen(findings)
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
    pageOf(categoryNodeId(group.category), group.findings)
  )
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
  const next = Math.min(Math.max((index === -1 ? 0 : index) + delta, 0), list.length - 1)
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

async function loadReport() {
  if (!validID(projectId.value) || locked.value) return
  report.value = await useApi<ConsistencyReport>(
    `/api/projects/${projectId.value}/consistency`
  )
}

async function load() {
  loading.value = true
  report.value = null
  try {
    if (!license.value) await loadLicense()
    await loadReport()
    syncSelection()
  } finally {
    loading.value = false
  }
}

onMounted(load)
watch(
  () => projectId.value,
  () => {
    shownState.value = {}
    openState.value = {}
    selectedKey.value = null
    clearFilter()
    load()
  }
)
watch(visibleFindings, () => syncSelection())

async function setIgnored(finding: ReportFinding, ignored: boolean) {
  if (!validID(projectId.value) || !report.value) return
  const before = navigable.value
  const index = before.findIndex((f) => findingKey(f) === findingKey(finding))
  try {
    await useApi(`/api/projects/${projectId.value}/consistency/ignore`, {
      method: 'POST',
      body: { ruleId: finding.ruleId, groupId: finding.groupId, ignored },
    })
  } catch {
    // The finding changed since the scan (409): the fresh report is the truth.
    await load()
    return
  }
  const current = report.value
  const key = findingKey(finding)
  if (ignored) {
    current.findings = current.findings.filter((f) => findingKey(f) !== key)
    current.ignored.push(finding)
  } else {
    current.ignored = current.ignored.filter((f) => findingKey(f) !== key)
    current.findings.push(finding)
  }
  const next = navigable.value
  const target = next[Math.min(index, next.length - 1)]
  selectedKey.value = target ? findingKey(target) : null
  syncSelection()
}

const summarySeverities = computed(() =>
  SEVERITIES.filter((severity) => counts.value[severity] > 0)
)

function headline(finding: ReportFinding) {
  const lead = finding.keys[0]
  if (!lead) return ''
  if (finding.category === 'duplicate') return `“${lead.sourceText}”`
  return lead.key
}

function rowLocales(finding: ReportFinding) {
  return findingLocales(finding)
}
</script>

<template>
  <div class="h-full min-w-0 flex flex-col bg-muted">
    <header
      class="shrink-0 px-6 py-5 bg-default border-b border-default flex items-baseline gap-3"
    >
      <h1 class="text-xl font-semibold tracking-tight">Consistency</h1>
      <span class="text-sm text-muted truncate">{{ curProject?.name }}</span>
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
          <h2 class="text-sm font-semibold">
            {{ categorySections[category].title }}
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

    <div v-else-if="loading" class="p-6 text-sm text-muted">Scanning…</div>

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
            <span class="tabular-nums opacity-70">{{
              counts[severity]
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
          <p
            v-if="allFindings.length"
            class="px-4 pt-3 text-sm text-muted flex items-center gap-2.5"
          >
            <span class="flex items-center gap-1.5">
              <span
                v-for="severity in summarySeverities"
                :key="severity"
                class="inline-flex items-center gap-0.5"
              >
                <UIcon
                  :name="severityMeta(severity).icon"
                  class="size-3.5"
                  :class="severityMeta(severity).iconClass"
                />
                <span class="tabular-nums">{{ counts[severity] }}</span>
              </span>
            </span>
            <span>
              · {{ report.scannedKeys }} keys · {{ report.sourceLocale }}
              <template v-if="filterActive">
                · {{ visibleFindings.length }}/{{ allFindings.length }} shown
              </template>
            </span>
          </p>
          <p v-else class="px-4 pt-3 text-sm text-muted">
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

          <div v-for="group in groups" :key="group.category" class="mt-2">
            <button
              type="button"
              class="w-full px-4 py-1.5 flex items-center gap-2 text-left hover:bg-elevated/50"
              :aria-expanded="isCategoryOpen(group.category, group.findings)"
              @click="toggleCategory(group.category, group.findings)"
            >
              <UIcon
                name="i-lucide:chevron-right"
                class="size-3.5 shrink-0 text-muted transition-transform"
                :class="isCategoryOpen(group.category, group.findings) && 'rotate-90'"
              />
              <span class="text-xs font-semibold uppercase text-muted">
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
                group.findings
              )"
              :key="findingKey(finding)"
              type="button"
              :data-finding-key="findingKey(finding)"
              class="w-full flex items-center gap-2 px-4 py-1.5 min-h-9 text-left border-l-2 transition-colors"
              :class="
                selectedKey === findingKey(finding)
                  ? 'border-l-primary bg-elevated'
                  : 'border-l-transparent hover:bg-elevated/50'
              "
              @click="select(finding)"
            >
              <span
                class="size-2 rounded-full shrink-0"
                :class="severityMeta(finding.severity).color === 'error' ? 'bg-error' : severityMeta(finding.severity).color === 'warning' ? 'bg-warning' : 'bg-accented'"
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
                  v-for="locale in rowLocales(finding).slice(0, MAX_LOCALE_BADGES)"
                  :key="locale"
                  color="neutral"
                  variant="outline"
                  size="xs"
                >
                  {{ locale }}
                </UBadge>
                <span
                  v-if="rowLocales(finding).length > MAX_LOCALE_BADGES"
                  class="text-xs text-muted"
                >
                  +{{ rowLocales(finding).length - MAX_LOCALE_BADGES }}
                </span>
                <UTooltip text="Ignore this finding">
                  <UButton
                    size="xs"
                    color="neutral"
                    variant="ghost"
                    icon="i-lucide:eye-off"
                    aria-label="Ignore"
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
                {{ remainingOf(categoryNodeId(group.category), group.findings) }}
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
                  Ignored findings
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
            class="flex flex-col gap-1 border-t border-default mt-2 px-4 py-3"
          >
            <h2 class="text-sm font-semibold text-muted">
              More checks coming
            </h2>
            <p class="text-xs text-muted">
              Semantic similarity · Design vs dictionary
            </p>
          </section>
        </aside>

        <main class="flex-1 min-w-0 overflow-auto bg-default">
          <ConsistencyFindingDetail
            v-if="selected"
            :finding="selected"
            :locales="filter.locales"
            @ignore="setIgnored(selected, true)"
          />
          <div
            v-else
            class="h-full flex flex-col items-center justify-center gap-2 text-muted p-6"
          >
            <UIcon name="i-lucide:mouse-pointer-click" class="size-8" />
            <p class="text-sm">Select a finding to review it here.</p>
            <p class="text-xs">
              ↑ ↓ browse · e ignore — deep links and highlights live in the
              detail.
            </p>
          </div>
        </main>
      </div>
    </template>
  </div>
</template>
