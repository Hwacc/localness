<script setup lang="ts">
/**
 * The instance's Plus state, shown under the version line in Settings. Absent
 * on the free tier — a badge saying "no license" is noise for the majority of
 * deployments. Not on the login page: no session there, and the customer name
 * must not appear on an unauthenticated surface.
 */
const { state, load } = useLicenseState()

onMounted(load)

const visible = computed(
  () => state.value != null && state.value.status !== 'none'
)

const meta = computed(() => {
  const current = state.value
  if (!current) return null

  const until = current.expiresAt?.slice(0, 10)
  switch (current.status) {
    case 'active':
      return {
        color: 'primary' as const,
        icon: 'i-lucide:badge-check',
        label: 'Plus',
        detail: `Licensed to ${current.customer} · until ${until}`,
      }
    case 'grace':
      return {
        color: 'warning' as const,
        icon: 'i-lucide:triangle-alert',
        label: 'Plus expiring',
        detail: `License expired ${until}. Plus stops soon — renew to keep it.`,
      }
    case 'expired':
      return {
        color: 'warning' as const,
        icon: 'i-lucide:triangle-alert',
        label: 'Plus expired',
        detail: `License expired ${until}. New Plus writes are disabled; existing data stays readable and exportable.`,
      }
    default:
      return null
  }
})
</script>

<template>
  <div v-if="visible && meta" class="flex flex-col gap-1">
    <UBadge
      :color="meta.color"
      variant="subtle"
      size="xs"
      :icon="meta.icon"
      class="w-fit"
    >
      {{ meta.label }}
    </UBadge>
    <p class="text-xs text-muted">{{ meta.detail }}</p>
  </div>
</template>
