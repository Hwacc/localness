<script setup lang="ts">
withDefaults(
  defineProps<{
    visible?: boolean
    compact?: boolean
    hint?: string
  }>(),
  {
    visible: false,
    compact: false,
  }
)
</script>

<template>
  <AccessRoleBadge
    kind="team-member"
    :visible="visible"
    :compact="compact"
    v-bind="hint ? { hint } : {}"
  />
</template>
