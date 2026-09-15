<script setup lang="ts">
import { NotificationAction } from '#shared/constants'
import { AlertModal } from '#components'

const open = ref(false)
const {
  items,
  pendingCount,
  actingId,
  removingId,
  clearing,
  startPolling,
  markVisibleRead,
  act,
  remove,
  clearAll,
} = useNotifications()

watch(open, async (isOpen) => {
  if (!isOpen) return
  await markVisibleRead()
})

onMounted(() => {
  startPolling()
})

/**
 * Clearing the Inbox also throws away unresolved invites, which is the same as
 * declining them without a trace — worth one confirmation, unlike the single-row
 * `×`. `remove` itself needs no modal.
 */
const overlay = useOverlay()
const clearModal = overlay.create(AlertModal)

function confirmClearAll() {
  clearModal.open({
    mode: 'delete',
    title: 'Clear Inbox',
    message:
      'Delete every notification? Pending invites go too, and the sender is not told — you will need a new invite to join that team.',
    okText: 'Clear',
    onOk: async (_mode, { close }) => {
      await clearAll()
      close()
    },
  })
}

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
      <div
        v-if="items.length > 0"
        class="mb-3 flex items-center justify-between gap-2"
      >
        <span class="text-xs text-muted">
          {{ items.length }} in Inbox
        </span>
        <UButton
          size="xs"
          color="neutral"
          variant="ghost"
          icon="i-lucide:trash-2"
          label="Clear all"
          :loading="clearing"
          :disabled="clearing"
          @click="confirmClearAll"
        />
      </div>
      <div v-if="items.length === 0" class="text-sm text-muted">
        No notifications.
      </div>
      <ul v-else class="flex flex-col gap-2.5">
        <li
          v-for="row in items"
          :key="row.id"
          class="rounded-lg border border-default px-3 py-2.5"
        >
          <div class="flex items-start gap-2">
            <div class="min-w-0 flex-1">
              <p class="text-sm font-medium">{{ row.title }}</p>
              <p class="mt-0.5 text-xs text-muted">{{ row.body }}</p>
            </div>
            <UButton
              size="xs"
              color="neutral"
              variant="ghost"
              icon="i-lucide:x"
              square
              :loading="removingId === row.id"
              :aria-label="`Delete ${row.title}`"
              @click="remove(row.id)"
            />
          </div>
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
