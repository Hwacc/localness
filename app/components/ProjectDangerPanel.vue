<script setup lang="ts">
/**
 * Project Settings → Danger zone: permanently delete the project. Pages,
 * translations and releases cascade with it and cannot be recovered; a Git sync
 * remote is untouched and is the only backup.
 */
const props = defineProps<{ project: IProject }>()
const emit = defineEmits<{ deleted: [] }>()

interface DeleteSummary {
  name: string
  pages: number
  keys: number
  publishedKeys: number
  gitSyncEnabled: boolean
}

const summary = ref<DeleteSummary | null>(null)
const confirmName = ref('')
const deleting = ref(false)

const nameMatches = computed(
  () => confirmName.value === props.project.name && !!props.project.name
)

onMounted(async () => {
  summary.value = await useApi<DeleteSummary>(
    `/api/projects/${props.project.id}/delete-summary`
  )
})

async function onDelete() {
  if (!nameMatches.value) return
  deleting.value = true
  try {
    await useApi(`/api/projects/${props.project.id}`, {
      method: 'DELETE',
      body: { confirmName: confirmName.value },
    })
    emit('deleted')
  } finally {
    deleting.value = false
  }
}
</script>

<template>
  <div class="flex flex-col gap-3">
    <UAlert
      color="error"
      variant="subtle"
      icon="i-lucide:triangle-alert"
      title="This permanently deletes the project and cannot be undone"
    >
      <template #description>
        <ul v-if="summary" class="list-disc pl-4 mt-1 space-y-0.5">
          <li>{{ summary.pages }} page(s) with their screenshots and tags</li>
          <li>
            {{ summary.keys }} translation key(s) and all their locale texts
          </li>
          <li v-if="summary.publishedKeys > 0" class="font-medium">
            {{ summary.publishedKeys }} published key(s) — delivery through
            the public API stops immediately
          </li>
          <li>Releases, namespaces, skills and API token access</li>
        </ul>
        <p v-else class="mt-1">Counting…</p>
        <p class="mt-2">
          <template v-if="summary?.gitSyncEnabled">
            Git sync is enabled: the remote repository is not touched, so it
            still holds your last pushed copy.
          </template>
          <template v-else>
            Git sync is not enabled, so there is no backup. Export first if
            you may need the data again.
          </template>
        </p>
      </template>
    </UAlert>
    <UFormField :label="`Type “${project.name}” to confirm`">
      <UInput v-model="confirmName" class="w-full" autocomplete="off" />
    </UFormField>
    <div>
      <UButton
        color="error"
        icon="i-lucide:trash-2"
        label="Delete this project"
        :disabled="!nameMatches"
        :loading="deleting"
        @click="onDelete"
      />
    </div>
  </div>
</template>
