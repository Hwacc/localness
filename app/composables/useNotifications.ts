import { NotificationAction, NotificationType } from '#shared/constants'

const POLL_MS = 30_000

export function useNotifications() {
  const { loggedIn } = useUserSession()
  const projectStore = useProjectStore()
  const items = useState<INotification[]>('notifications:items', () => [])
  const pendingCount = useState('notifications:pending', () => 0)
  const actingId = useState<ID | null>('notifications:acting', () => null)
  const removingId = useState<ID | null>('notifications:removing', () => null)
  const clearing = useState('notifications:clearing', () => false)
  const timer = useState<ReturnType<typeof setInterval> | null>(
    'notifications:timer',
    () => null
  )
  const hydrated = useState('notifications:hydrated', () => false)

  async function refresh() {
    if (!loggedIn.value) return
    const res = await useApi<{
      items: INotification[]
      pendingCount: number
    }>('/api/notifications')
    if (!res) return
    const known = new Set(items.value.map((row) => Number(row.id)))
    items.value = res.items
    pendingCount.value = res.pendingCount
    // The first load seeds the baseline; only rows that arrived afterwards are
    // "new", so boot does not fire the side effect below.
    if (!hydrated.value) {
      hydrated.value = true
      return
    }
    // An approved join request lands on the applicant as a fresh row — the
    // teams list has to catch up, and only their own polling sees it.
    const joined = res.items.some(
      (row) =>
        !known.has(Number(row.id)) &&
        row.type === NotificationType.TEAM_JOIN_APPROVED
    )
    if (joined) await projectStore.getProjects()
  }

  async function markVisibleRead() {
    const unreadIds = items.value
      .filter((row) => !row.readAt)
      .map((row) => Number(row.id))
      .filter((id) => Number.isInteger(id) && id > 0)
    if (!unreadIds.length) return
    const res = await useApi<{
      items: INotification[]
      pendingCount: number
    }>('/api/notifications/read', {
      method: 'POST',
      body: { ids: unreadIds },
    })
    if (!res) return
    items.value = res.items
    pendingCount.value = res.pendingCount
  }

  async function requestDelete(ids?: number[]) {
    const res = await useApi<{
      items: INotification[]
      pendingCount: number
    }>('/api/notifications/delete', {
      method: 'POST',
      // No ids means the whole Inbox, unresolved invites included.
      body: ids?.length ? { ids } : {},
    })
    if (!res) return
    items.value = res.items
    pendingCount.value = res.pendingCount
  }

  async function remove(id: ID) {
    if (!validID(id)) return
    removingId.value = id
    try {
      await requestDelete([Number(id)])
    } finally {
      removingId.value = null
    }
  }

  async function clearAll() {
    clearing.value = true
    try {
      await requestDelete()
    } finally {
      clearing.value = false
    }
  }

  async function act(id: ID, action: NotificationAction) {
    if (
      action !== NotificationAction.ACCEPTED &&
      action !== NotificationAction.DECLINED
    ) {
      return
    }
    actingId.value = id
    try {
      const updated = await useApi<INotification>(
        `/api/notifications/${id}/act`,
        {
          method: 'POST',
          body: { action },
        }
      )
      if (!updated) return
      await refresh()
      if (action === NotificationAction.ACCEPTED) {
        await projectStore.getProjects()
      }
    } finally {
      actingId.value = null
    }
  }

  function stopPolling() {
    if (timer.value) {
      clearInterval(timer.value)
      timer.value = null
    }
  }

  function startPolling() {
    if (!import.meta.client) return
    void refresh()
    if (timer.value) return
    timer.value = setInterval(() => {
      void refresh()
    }, POLL_MS)
  }

  function reset() {
    stopPolling()
    items.value = []
    pendingCount.value = 0
    hydrated.value = false
  }

  if (import.meta.client) {
    watch(
      loggedIn,
      (value) => {
        if (value) startPolling()
        else reset()
      },
      { immediate: true }
    )
  }

  return {
    items,
    pendingCount,
    actingId,
    removingId,
    clearing,
    refresh,
    markVisibleRead,
    act,
    remove,
    clearAll,
    startPolling,
    reset,
  }
}
