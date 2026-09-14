import { NotificationAction } from '#shared/constants'

const POLL_MS = 30_000

export function useNotifications() {
  const { loggedIn } = useUserSession()
  const projectStore = useProjectStore()
  const items = useState<INotification[]>('notifications:items', () => [])
  const pendingCount = useState('notifications:pending', () => 0)
  const actingId = useState<ID | null>('notifications:acting', () => null)
  const timer = useState<ReturnType<typeof setInterval> | null>(
    'notifications:timer',
    () => null
  )

  async function refresh() {
    if (!loggedIn.value) return
    const res = await useApi<{
      items: INotification[]
      pendingCount: number
    }>('/api/notifications')
    if (!res) return
    items.value = res.items
    pendingCount.value = res.pendingCount
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
    refresh,
    markVisibleRead,
    act,
    startPolling,
    reset,
  }
}
