<script setup lang="ts">
import {
  firstSegment,
  keyPathNamespace,
  namespaceNameRejectReason,
} from '#shared/utils/namespace'

/**
 * Ties a page's key path to the project's namespaces, whose names are relative
 * to the project prefix just as the path is: which namespace keys generated
 * under it land in, the declared names as one-click fills, and — when the path
 * lands in Ungrouped — a way for an owner to declare its first segment.
 */
const props = defineProps<{
  path: string
  separator: string
  names: string[]
  /** Set only when the viewer may declare a namespace. */
  projectId?: ID
  disabled?: boolean
}>()

const emit = defineEmits<{
  pick: [name: string]
  added: []
}>()

const path = computed(() => props.path.trim())

const target = computed(() =>
  keyPathNamespace(path.value, props.separator, props.names)
)

/** The segment to declare, when declaring it would be accepted. */
const candidate = computed(() => {
  const name = firstSegment(path.value)
  return namespaceNameRejectReason({ name, takenNames: props.names }) === null
    ? name
    : null
})

const adding = ref(false)

async function addCandidate() {
  const name = candidate.value
  if (!name || !validID(props.projectId)) return
  adding.value = true
  try {
    const created = await useApi(`/api/projects/${props.projectId}/namespaces`, {
      method: 'POST',
      body: { name },
    })
    if (created) emit('added')
  } finally {
    adding.value = false
  }
}
</script>

<template>
  <div class="flex flex-col gap-1.5 text-xs">
    <div v-if="names.length" class="flex flex-wrap items-center gap-1">
      <span class="text-muted">Namespaces:</span>
      <UButton
        v-for="name in names"
        :key="name"
        size="xs"
        color="neutral"
        :variant="target === name ? 'soft' : 'outline'"
        class="font-mono"
        :label="name"
        :disabled="disabled"
        @click="emit('pick', name)"
      />
    </div>
    <p v-if="!path" class="text-muted">
      No key path — generated keys group by whatever name the AI picks.
    </p>
    <p v-else-if="target" class="text-muted">
      Generated keys group under
      <code class="text-default">{{ target }}</code>.
    </p>
    <div v-else class="flex flex-wrap items-center gap-2 text-warning">
      <UIcon name="i-lucide:triangle-alert" class="size-3.5 shrink-0" />
      <span>Keys under this path will be Ungrouped.</span>
      <UButton
        v-if="candidate && validID(projectId)"
        size="xs"
        color="neutral"
        variant="soft"
        icon="i-lucide:folder-plus"
        :loading="adding"
        :disabled="disabled"
        @click="addCandidate"
      >
        Add <code>{{ candidate }}</code> as namespace
      </UButton>
      <span v-else-if="candidate" class="text-muted">
        A project owner can add <code>{{ candidate }}</code> as a namespace.
      </span>
    </div>
  </div>
</template>
