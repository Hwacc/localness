<script setup lang="ts">
import {
  firstSegment,
  namespaceNameRejectReason,
  prefixNamespace,
} from '#shared/utils/namespace'

/**
 * Ties a Key Prefix to the project's namespaces: which namespace keys generated
 * under it land in, the declared names as one-click fills, and — when the
 * prefix lands in Ungrouped — a way to declare its first segment.
 */
const props = defineProps<{
  prefix: string
  separator: string
  names: string[]
  /** Set when the viewer may declare a namespace on an existing project. */
  projectId?: ID
  /** A new project declares its prefix's first segment on create. */
  creating?: boolean
  disabled?: boolean
}>()

const emit = defineEmits<{
  pick: [name: string]
  added: []
}>()

const prefix = computed(() => props.prefix.trim())

const target = computed(() =>
  prefixNamespace(prefix.value, props.separator, props.names)
)

/** The segment to declare, when declaring it would be accepted. */
const candidate = computed(() => {
  const name = firstSegment(prefix.value)
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
    <p v-if="!prefix" class="text-muted">
      No prefix — generated keys group by whatever name the AI picks.
    </p>
    <p v-else-if="target" class="text-muted">
      Generated keys group under
      <code class="text-default">{{ target }}</code>.
    </p>
    <p v-else-if="creating && candidate" class="text-muted">
      The namespace <code class="text-default">{{ candidate }}</code> is
      created with the project.
    </p>
    <div v-else class="flex flex-wrap items-center gap-2 text-warning">
      <UIcon name="i-lucide:triangle-alert" class="size-3.5 shrink-0" />
      <span>Keys under this prefix will be Ungrouped.</span>
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
    </div>
  </div>
</template>
