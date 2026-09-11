<script setup lang="ts">
import {
  GitSyncLogAction,
  GitSyncLogStatus,
  GitSyncPushReason,
} from '#shared/constants'
import { formatI18nKeyDisplay, validID } from '#shared/utils'
import type {
  IGitSyncConflictLogDetail,
  IGitSyncLog,
  IGitSyncLogPage,
  IGitSyncPullLogDetail,
  IGitSyncPushLogDetail,
} from '#shared/types/GitSync'

const props = defineProps<{ projectId: ID }>()
const emit = defineEmits<{ close: [boolean] }>()

const { $dayjs } = useNuxtApp()

const rows = ref<IGitSyncLog[]>([])
const nextCursor = ref<number | null>(null)
const loading = ref(false)
const actionFilter = ref<GitSyncLogAction | 'all'>('all')
const expanded = ref<Record<string, boolean>>({})

const actionItems = [
  { label: 'All actions', value: 'all' },
  { label: 'Pull applied', value: GitSyncLogAction.PULL_APPLY },
  { label: 'Push applied', value: GitSyncLogAction.PUSH_APPLY },
  { label: 'Conflict resolved', value: GitSyncLogAction.CONFLICT_RESOLVE },
]

const actionLabel: Record<GitSyncLogAction, string> = {
  [GitSyncLogAction.PULL_APPLY]: 'Pull',
  [GitSyncLogAction.PUSH_APPLY]: 'Push',
  [GitSyncLogAction.CONFLICT_RESOLVE]: 'Conflict',
}

const statusLabel: Record<GitSyncLogStatus, string> = {
  [GitSyncLogStatus.SUCCESS]: 'Success',
  [GitSyncLogStatus.PARTIAL]: 'Partial',
  [GitSyncLogStatus.REFUSED]: 'Refused',
  [GitSyncLogStatus.FAILED]: 'Failed',
}

const pushReasonLabel: Record<string, string> = {
  [GitSyncPushReason.NEW_KEY]: 'New key',
  [GitSyncPushReason.CHANGED]: 'Changed',
  [GitSyncPushReason.UNCHANGED]: 'Unchanged',
  [GitSyncPushReason.NOT_PUBLISHED]: 'No published text',
  [GitSyncPushReason.DRAFT_KEY]: 'Auto draft key',
  [GitSyncPushReason.REMOTE_CHANGED]: 'Git is ahead',
  [GitSyncPushReason.CONFLICT]: 'Conflict',
}

function statusColor(
  status: GitSyncLogStatus
): 'success' | 'primary' | 'warning' | 'error' | 'neutral' {
  switch (status) {
    case GitSyncLogStatus.SUCCESS:
      return 'success'
    case GitSyncLogStatus.PARTIAL:
      return 'primary'
    case GitSyncLogStatus.REFUSED:
      return 'warning'
    case GitSyncLogStatus.FAILED:
      return 'error'
    default: {
      const _exhaustive: never = status
      return _exhaustive
    }
  }
}

function isPull(row: IGitSyncLog): IGitSyncPullLogDetail | null {
  return row.action === GitSyncLogAction.PULL_APPLY
    ? (row.detail as IGitSyncPullLogDetail | null)
    : null
}

function isPush(row: IGitSyncLog): IGitSyncPushLogDetail | null {
  return row.action === GitSyncLogAction.PUSH_APPLY
    ? (row.detail as IGitSyncPushLogDetail | null)
    : null
}

function isConflict(row: IGitSyncLog): IGitSyncConflictLogDetail | null {
  return row.action === GitSyncLogAction.CONFLICT_RESOLVE
    ? (row.detail as IGitSyncConflictLogDetail | null)
    : null
}

/** One-line recap of what the run did. Detail lives in the expanded row. */
function summary(row: IGitSyncLog): string {
  const pull = isPull(row)
  if (pull) {
    const parts = [`${pull.applied} key(s) applied`]
    if (pull.aligned) parts.push(`${pull.aligned} aligned`)
    if (pull.kept) parts.push(`${pull.kept} kept`)
    parts.push(`${pull.files} file(s)`)
    return parts.join(' · ')
  }
  const push = isPush(row)
  if (push) {
    if (!push.count) return 'Nothing landed'
    const parts = [`${push.count} key(s) pushed`]
    if (push.filename) parts.push(push.filename)
    if (push.reconciled) parts.push('reconciled')
    return parts.join(' · ')
  }
  const conflict = isConflict(row)
  if (conflict) {
    const choice =
      conflict.action === 'ours'
        ? 'used platform'
        : conflict.action === 'theirs'
          ? 'used Git'
          : 'edited'
    return `${formatI18nKeyDisplay(conflict.key)} (${conflict.locale}) — ${choice}`
  }
  return '—'
}

function skipEntries(detail: IGitSyncPushLogDetail) {
  return Object.entries(detail.skipped).filter(([, n]) => Number(n) > 0)
}

async function load(reset: boolean) {
  if (!validID(props.projectId)) return
  loading.value = true
  try {
    const page = await useApi<IGitSyncLogPage>(
      `/api/projects/${props.projectId}/git-sync/history`,
      {
        query: {
          ...(actionFilter.value === 'all'
            ? {}
            : { action: actionFilter.value }),
          ...(reset || !nextCursor.value ? {} : { cursor: nextCursor.value }),
        },
      }
    )
    if (!page) return
    rows.value = reset ? page.rows : [...rows.value, ...page.rows]
    nextCursor.value = page.nextCursor
  } finally {
    loading.value = false
  }
}

watch(actionFilter, () => {
  nextCursor.value = null
  expanded.value = {}
  load(true)
})

onMounted(() => {
  load(true)
})
</script>

<template>
  <UModal
    title="Sync history"
    description="What Pull, Push and conflict resolution actually did."
    class="max-w-4xl"
    @update:open="(isOpen) => !isOpen && emit('close', false)"
  >
    <template #body>
      <div class="flex flex-col gap-3">
        <div class="flex items-center justify-between gap-2">
          <p class="text-sm text-muted">
            Previews are not recorded — only runs that landed something.
          </p>
          <USelect
            v-model="actionFilter"
            class="w-48"
            size="sm"
            :items="actionItems"
          />
        </div>

        <div class="max-h-[60vh] overflow-auto flex flex-col gap-2">
          <div
            v-for="row in rows"
            :key="row.id"
            class="rounded-lg border border-default p-3 flex flex-col gap-2"
          >
            <div class="flex flex-wrap items-center gap-2">
              <UBadge variant="subtle" color="neutral">
                {{ actionLabel[row.action] ?? row.action }}
              </UBadge>
              <UBadge variant="subtle" :color="statusColor(row.status)">
                {{ statusLabel[row.status] ?? row.status }}
              </UBadge>
              <span class="text-sm">{{ summary(row) }}</span>
              <div class="ml-auto flex items-center gap-3">
                <span
                  v-if="row.commitSha"
                  class="text-xs font-mono text-muted"
                  :title="row.commitSha"
                >
                  {{ row.commitSha.slice(0, 7) }}
                </span>
                <div class="flex items-center gap-2">
                  <UAvatar size="xs" :src="row.user?.avatar" />
                  <span class="text-xs text-muted">
                    {{ row.user?.nickname ?? row.user?.username ?? 'Unknown' }}
                  </span>
                </div>
                <span class="text-xs text-muted whitespace-nowrap">
                  {{ $dayjs(row.createdAt).format('YYYY-MM-DD HH:mm') }}
                </span>
                <UButton
                  size="xs"
                  color="neutral"
                  variant="ghost"
                  square
                  :icon="
                    expanded[row.id]
                      ? 'i-lucide:chevron-up'
                      : 'i-lucide:chevron-down'
                  "
                  @click="expanded[row.id] = !expanded[row.id]"
                />
              </div>
            </div>

            <div
              v-if="expanded[row.id]"
              class="text-xs text-muted flex flex-col gap-1"
            >
              <template v-if="isPull(row)">
                <p>
                  Applied {{ isPull(row)?.applied }} · aligned
                  {{ isPull(row)?.aligned }} · kept {{ isPull(row)?.kept }} ·
                  files {{ isPull(row)?.files }}
                </p>
              </template>
              <template v-else-if="isPush(row)">
                <p v-if="isPush(row)?.filename">
                  Batch {{ isPush(row)?.filename }}
                </p>
                <p v-if="isPush(row)?.reconciled">
                  Reconciled a batch already on the remote.
                </p>
                <p v-if="skipEntries(isPush(row)!).length">
                  Skipped:
                  {{
                    skipEntries(isPush(row)!)
                      .map(
                        ([reason, n]) =>
                          `${pushReasonLabel[reason] ?? reason} ${n}`
                      )
                      .join(' · ')
                  }}
                </p>
                <p v-if="isPush(row)?.conflicts">
                  {{ isPush(row)?.conflicts }} key(s) became conflict cards.
                </p>
                <p v-if="isPush(row)?.keys.length" class="break-all">
                  Keys:
                  {{
                    isPush(row)!
                      .keys.map((k) => formatI18nKeyDisplay(k))
                      .join(', ')
                  }}
                </p>
              </template>
              <template v-else-if="isConflict(row)">
                <p class="break-all">
                  Key {{ isConflict(row)?.key }} ·
                  {{ isConflict(row)?.locale }} · chose
                  {{ isConflict(row)?.action }}
                </p>
              </template>
              <p v-if="row.previewId">Preview #{{ row.previewId }}</p>
            </div>
          </div>

          <p v-if="!rows.length && !loading" class="py-8 text-center text-sm text-muted">
            No sync history yet.
          </p>
        </div>

        <div class="flex justify-center">
          <UButton
            v-if="nextCursor"
            size="sm"
            color="neutral"
            variant="ghost"
            :loading="loading"
            label="Load more"
            @click="load(false)"
          />
        </div>
      </div>
    </template>
  </UModal>
</template>
