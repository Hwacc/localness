import { getLocalTimeZone, type DateValue } from '@internationalized/date'
import { I18nKeyStatusFilter } from '#shared/constants'

/** The calendar writes its own `DateValue` into the untyped range below. */
function asDate(value: unknown) {
  return (value ?? undefined) as DateValue | undefined
}

/**
 * Shared query state for the i18n key list: search, status, updated-at range,
 * page scope, paging. Owns the request, not the presentation, so the
 * translations table and the export picker can filter the same way.
 */
export function useI18nKeyQuery(options: {
  projectId: Ref<ID>
  /** Restrict to keys tagged on these pages (plus keys with no tag at all). */
  pageIds?: Ref<number[]>
  /** Restrict to one release label, or to the unlabelled entries. */
  releaseFilter?: Ref<ReleaseFilterValue>
  limit?: number
}) {
  const { $dayjs } = useNuxtApp()
  const limit = options.limit ?? 20

  const q = ref('')
  const status = ref<I18nKeyStatusFilter>(I18nKeyStatusFilter.ALL)
  const includeDraftKeys = ref(false)
  // A ref, not reactive: the range calendar replaces the whole object.
  const dateRange = ref({ start: undefined, end: undefined })
  const page = ref(1)
  const total = ref(0)
  const rows = ref<II18nKeyRow[]>([])
  const loading = ref(false)

  const hasDateRange = computed(() =>
    Boolean(dateRange.value.start || dateRange.value.end)
  )

  /** Whole local days, so a single picked day covers that day end to end. */
  function dateParams() {
    const start = asDate(dateRange.value.start)
    const end = asDate(dateRange.value.end)
    const params: Record<string, string> = {}
    if (start) {
      params.from = $dayjs(start.toDate(getLocalTimeZone()))
        .startOf('day')
        .toISOString()
    }
    if (end || start) {
      params.to = $dayjs((end ?? start)!.toDate(getLocalTimeZone()))
        .endOf('day')
        .toISOString()
    }
    return params
  }

  function baseParams() {
    const params = new URLSearchParams(dateParams())
    if (q.value.trim()) params.set('q', q.value.trim())
    if (status.value !== I18nKeyStatusFilter.ALL) {
      params.set('status', status.value)
    }
    if (includeDraftKeys.value) params.set('includeDraftKeys', '1')
    const pageIds = options.pageIds?.value ?? []
    if (pageIds.length) params.set('pageIds', pageIds.join(','))
    const releaseFilter = options.releaseFilter?.value
    if (releaseFilter === 'unassigned') {
      params.set('unassigned', '1')
    } else if (typeof releaseFilter === 'number') {
      params.set('releaseId', String(releaseFilter))
    }
    return params
  }

  async function load() {
    if (!validID(options.projectId.value)) {
      rows.value = []
      total.value = 0
      return
    }
    loading.value = true
    try {
      const params = baseParams()
      params.set('page', String(page.value))
      params.set('limit', String(limit))
      const res = await useApi<IPagination<II18nKeyRow[]>>(
        `/api/projects/${options.projectId.value}/i18n-keys?${params}`
      )
      if (!res) return
      rows.value = res.data ?? []
      total.value = res.total
      page.value = res.page
    } finally {
      loading.value = false
    }
  }

  /** Every id the current filters match, for a "select all matching" action. */
  async function matchingIds() {
    if (!validID(options.projectId.value)) return []
    const params = baseParams()
    params.set('idsOnly', '1')
    const res = await useApi<{ ids: number[] }>(
      `/api/projects/${options.projectId.value}/i18n-keys?${params}`
    )
    return res?.ids ?? []
  }

  function reload() {
    page.value = 1
    load()
  }

  return {
    q,
    status,
    includeDraftKeys,
    dateRange,
    hasDateRange,
    page,
    limit,
    total,
    rows,
    loading,
    load,
    reload,
    matchingIds,
  }
}
