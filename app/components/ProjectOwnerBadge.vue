<script setup lang="ts">
const props = withDefaults(
  defineProps<{
    visible?: boolean
    compact?: boolean
    hint?: string
    project?: IProject | null
  }>(),
  {
    visible: false,
    compact: false,
  }
)

const userStore = useUserStore()

const show = computed(() => {
  if (props.visible) return true
  const project = props.project
  if (!project) return false
  if (project.isSteward) return true
  const uid = userStore.user?.id
  if (uid == null || uid === 0) return false
  return Boolean(
    project.owners?.some((row) => String(row.userId) === String(uid))
  )
})
</script>

<template>
  <AccessRoleBadge
    kind="project-owner"
    :visible="show"
    :compact="compact"
    v-bind="hint ? { hint } : {}"
  />
</template>
