<script lang="ts">
interface Props {
  mode: 'copy' | 'move'
  /**
   * Snapshot taken when the menu item was clicked. The page clears its row
   * selection on every reload, so the modal must not re-read it.
   */
  keyIds: number[]
  /** Projects the user can see, minus the source. */
  targetProjects: Array<{ label: string; value: number }>
  sourceProjectName: string
  /** Any selected row is published — the copy goes live in the target at once. */
  hasPublished: boolean
  loading?: boolean
}
</script>

<script lang="ts" setup>
const props = defineProps<Props>()
const emit = defineEmits<{
  close: [boolean]
  ok: [{ targetProjectId: number; close: () => void }]
}>()

const targetId = ref<number | undefined>(undefined)

function onOk() {
  if (targetId.value === undefined) return
  emit('ok', {
    targetProjectId: targetId.value,
    close: () => emit('close', true),
  })
}
</script>

<template>
  <UModal
    :title="props.mode === 'move' ? 'Move translations' : 'Copy translations'"
    @update:open="(isOpen) => !isOpen && emit('close', false)"
  >
    <template #body>
      <div class="flex flex-col gap-4">
        <p class="text-sm text-muted">
          <template v-if="props.mode === 'move'">
            {{ props.keyIds.length }} translation(s) will be removed from
            <span class="text-highlighted">{{ props.sourceProjectName }}</span>
            and added to the project below.
          </template>
          <template v-else>
            {{ props.keyIds.length }} translation(s) will be added to the
            project below.
            <span class="text-highlighted">{{ props.sourceProjectName }}</span>
            is left as it is.
          </template>
        </p>

        <USelectMenu
          v-model="targetId"
          class="w-full"
          :items="props.targetProjects"
          value-key="value"
          placeholder="Pick a destination project"
        />

        <p v-if="props.mode === 'move'" class="text-sm text-muted">
          Tags drawn on this project's screenshots keep their boxes but lose the
          binding to these keys.
        </p>

        <p v-if="props.hasPublished" class="text-sm text-warning">
          A published translation arrives published — it goes live in the
          target's export and API straight away.
        </p>
      </div>
    </template>

    <template #footer>
      <div class="w-full flex items-center justify-end gap-4">
        <UButton
          color="neutral"
          variant="ghost"
          :disabled="props.loading"
          @click="emit('close', false)"
        >
          Cancel
        </UButton>
        <UButton
          :color="props.mode === 'move' ? 'warning' : 'primary'"
          :loading="props.loading"
          :disabled="targetId === undefined"
          @click="onOk"
        >
          {{ props.mode === 'move' ? 'Move' : 'Copy' }}
        </UButton>
      </div>
    </template>
  </UModal>
</template>
