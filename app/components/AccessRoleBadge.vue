<script setup lang="ts">
export type AccessRoleKind = 'project-owner' | 'team-owner' | 'team-member'

const props = withDefaults(
  defineProps<{
    kind: AccessRoleKind
    visible?: boolean
    compact?: boolean
    hint?: string
  }>(),
  {
    visible: false,
    compact: false,
  }
)

function roleMeta(kind: AccessRoleKind) {
  switch (kind) {
    case 'project-owner':
      return {
        label: 'Project Owner',
        hint: 'Project Owner',
        icon: 'i-lucide:shield',
        color: 'primary' as const,
      }
    case 'team-owner':
      return {
        label: 'Team OWNER',
        hint: 'Team OWNER',
        icon: 'i-lucide:crown',
        color: 'primary' as const,
      }
    case 'team-member':
      return {
        label: 'Team member',
        hint: 'Team member',
        icon: 'i-lucide:users',
        color: 'neutral' as const,
      }
    default: {
      const _exhaustive: never = kind
      throw new Error(`Unknown access role: ${String(_exhaustive)}`)
    }
  }
}

const meta = computed(() => roleMeta(props.kind))
const tooltip = computed(() => props.hint || meta.value.hint)
</script>

<template>
  <span
    v-if="visible"
    class="inline-flex shrink-0 items-center"
  >
    <UTooltip :text="tooltip">
      <span class="inline-flex">
        <UBadge
          :color="meta.color"
          variant="subtle"
          size="xs"
          :icon="meta.icon"
        >
          <span v-if="!compact" class="whitespace-nowrap">{{ meta.label }}</span>
        </UBadge>
      </span>
    </UTooltip>
  </span>
</template>
