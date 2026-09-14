<script setup lang="ts">
import { NotificationAction } from '#shared/constants'

const open = ref(false)
const {
  items,
  pendingCount,
  actingId,
  startPolling,
  markVisibleRead,
  act,
} = useNotifications()

watch(open, async (isOpen) => {
  if (!isOpen) return
  await markVisibleRead()
})

onMounted(() => {
  startPolling()
})

function actionLabel(action: string) {
  switch (action) {
    case NotificationAction.ACCEPTED:
      return 'Accepted'
    case NotificationAction.DECLINED:
      return 'Declined'
    case NotificationAction.PENDING:
      return 'Pending'
    case NotificationAction.NONE:
      return ''
    default: {
      const _exhaustive: never = action as never
      return _exhaustive
    }
  }
}
</script>

<template>
  <USlideover
    v-model:open="open"
    title="Inbox"
    description="Team invites and later in-app notices."
    side="left"
    :close="{ icon: 'i-lucide:x' }"
    :ui="{ body: 'p-4 sm:p-4', header: 'p-4 sm:p-4' }"
    class="max-w-sm"
  >
    <UTooltip text="Inbox" :content="{ side: 'right' }">
      <span class="relative inline-flex">
        <UButton
          icon="i-lucide:bell"
          size="md"
          color="neutral"
          variant="ghost"
        />
        <span
          v-if="pendingCount > 0"
          class="absolute -top-0.5 -right-0.5 min-w-4 h-4 px-1 rounded-full bg-error text-[10px] leading-4 text-white text-center"
        >
          {{ pendingCount > 9 ? '9+' : pendingCount }}
        </span>
      </span>
    </UTooltip>
    <template #body>
      <div v-if="items.length === 0" class="text-sm text-muted">
        No notifications.
      </div>
      <ul v-else class="flex flex-col gap-2.5">
        <li
          v-for="row in items"
          :key="row.id"
          class="rounded-lg border border-default px-3 py-2.5"
        >
          <p class="text-sm font-medium">{{ row.title }}</p>
          <p class="mt-0.5 text-xs text-muted">{{ row.body }}</p>
          <div
            v-if="row.action === NotificationAction.PENDING"
            class="mt-2 flex items-center gap-2"
          >
            <UButton
              size="xs"
              label="Accept"
              :loading="actingId === row.id"
              @click="act(row.id, NotificationAction.ACCEPTED)"
            />
            <UButton
              size="xs"
              color="neutral"
              variant="outline"
              label="Decline"
              :disabled="actingId === row.id"
              @click="act(row.id, NotificationAction.DECLINED)"
            />
          </div>
          <p v-else class="mt-2 text-xs text-muted">
            {{ actionLabel(String(row.action)) }}
          </p>
        </li>
      </ul>
    </template>
  </USlideover>
</template>
