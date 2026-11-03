<script setup lang="ts">
import { AlertModal } from '#components'
import {
  NAMESPACE_NAME_MESSAGES,
  namespaceNameRejectReason,
} from '#shared/utils/namespace'

/**
 * Project Settings → Namespaces: declare, rename, reorder and drop the names
 * the Translations list groups keys by. Keys are never touched — membership is
 * read from the key name — so every action here is cheap to undo.
 */
const props = defineProps<{
  projectId: ID
  namespaces: IKeyNamespace[]
  loading: boolean
}>()

const emit = defineEmits<{ changed: [] }>()

const overlay = useOverlay()
const confirmModal = overlay.create(AlertModal)

const names = computed(() => props.namespaces.map((ns) => ns.name))

const newName = ref('')
const adding = ref(false)

/** Live, so a bad name explains itself before the round trip. */
const newNameError = computed(() => {
  if (!newName.value.trim()) return null
  const reason = namespaceNameRejectReason({
    name: newName.value,
    takenNames: names.value,
  })
  return reason ? NAMESPACE_NAME_MESSAGES[reason] : null
})

const suggestions = ref<Array<{ name: string; count: number }>>([])

async function loadSuggestions() {
  if (!validID(props.projectId)) return
  const res = await useApi<{ suggestions: typeof suggestions.value }>(
    `/api/projects/${props.projectId}/i18n-keys/namespaces?includeDraftKeys=1`
  )
  suggestions.value = res?.suggestions ?? []
}

async function changed() {
  emit('changed')
  await loadSuggestions()
}

async function addNamespace(name: string) {
  if (!name.trim() || !validID(props.projectId)) return
  adding.value = true
  try {
    const created = await useApi(`/api/projects/${props.projectId}/namespaces`, {
      method: 'POST',
      body: { name: name.trim() },
    })
    if (!created) return
    if (name === newName.value) newName.value = ''
    await changed()
  } finally {
    adding.value = false
  }
}

const renamingId = ref<ID | null>(null)
const renameValue = ref('')

function startRename(ns: IKeyNamespace) {
  renamingId.value = ns.id
  renameValue.value = ns.name
}

async function commitRename(ns: IKeyNamespace) {
  const name = renameValue.value.trim()
  renamingId.value = null
  if (!name || name === ns.name) return
  await useApi(`/api/projects/${props.projectId}/namespaces/${ns.id}`, {
    method: 'PATCH',
    body: { name },
  })
  await changed()
}

function confirmRemove(ns: IKeyNamespace) {
  confirmModal.open({
    mode: 'delete',
    title: 'Delete namespace',
    message: `Delete “${ns.name}”? No key is renamed or deleted — its keys move to Ungrouped.`,
    okText: 'Delete',
    onOk: async (_mode, { close }) => {
      await useApi(`/api/projects/${props.projectId}/namespaces/${ns.id}`, {
        method: 'DELETE',
      })
      await changed()
      close()
    },
  })
}

const reordering = ref(false)

async function move(index: number, delta: -1 | 1) {
  const ids = props.namespaces.map((ns) => Number(ns.id))
  const other = index + delta
  if (other < 0 || other >= ids.length) return
  ;[ids[index], ids[other]] = [ids[other]!, ids[index]!]
  reordering.value = true
  try {
    await useApi(`/api/projects/${props.projectId}/namespaces/order`, {
      method: 'PUT',
      body: { ids },
    })
    emit('changed')
  } finally {
    reordering.value = false
  }
}

onMounted(loadSuggestions)
</script>

<template>
  <div class="flex flex-col gap-2.5">
    <p v-if="loading && !namespaces.length" class="text-xs text-muted">
      Loading…
    </p>
    <p v-else-if="namespaces.length === 0" class="text-xs text-muted">
      No namespaces yet. A key joins one when its name starts with the
      namespace followed by a separator — <code>s2w</code> holds
      <code>s2w_ship_title</code> and <code>s2w.ship.title</code>.
    </p>
    <ul v-else class="flex flex-col gap-1">
      <li
        v-for="(ns, index) in namespaces"
        :key="ns.id"
        class="flex items-center gap-1"
      >
        <UInput
          v-if="renamingId === ns.id"
          v-model="renameValue"
          class="min-w-0 flex-1"
          size="sm"
          autofocus
          @blur="commitRename(ns)"
          @keydown.enter.prevent="commitRename(ns)"
          @keydown.esc="renamingId = null"
        />
        <button
          v-else
          type="button"
          class="min-w-0 flex-1 truncate rounded px-2 py-1 text-left font-mono text-sm hover:bg-elevated"
          @click="startRename(ns)"
        >
          {{ ns.name }}
        </button>
        <UButton
          size="xs"
          color="neutral"
          variant="ghost"
          icon="i-lucide:arrow-up"
          square
          :aria-label="`Move ${ns.name} up`"
          :disabled="index === 0 || reordering"
          @click="move(index, -1)"
        />
        <UButton
          size="xs"
          color="neutral"
          variant="ghost"
          icon="i-lucide:arrow-down"
          square
          :aria-label="`Move ${ns.name} down`"
          :disabled="index === namespaces.length - 1 || reordering"
          @click="move(index, 1)"
        />
        <UButton
          size="xs"
          color="error"
          variant="ghost"
          icon="i-lucide:trash-2"
          square
          :aria-label="`Delete ${ns.name}`"
          @click="confirmRemove(ns)"
        />
      </li>
    </ul>
    <UFormField :error="newNameError ?? undefined">
      <div class="flex items-center gap-2">
        <UInput
          v-model="newName"
          class="min-w-0 flex-1 font-mono"
          size="sm"
          placeholder="New namespace, e.g. s2w"
          @keydown.enter.prevent="!newNameError && addNamespace(newName)"
        />
        <UButton
          size="sm"
          label="Add"
          icon="i-lucide:plus"
          :loading="adding"
          :disabled="!newName.trim() || Boolean(newNameError)"
          @click="addNamespace(newName)"
        />
      </div>
    </UFormField>
    <div v-if="suggestions.length" class="flex flex-wrap items-center gap-1">
      <span class="text-xs text-muted">Suggested from Ungrouped keys:</span>
      <UButton
        v-for="suggestion in suggestions"
        :key="suggestion.name"
        size="xs"
        color="neutral"
        variant="outline"
        icon="i-lucide:plus"
        class="font-mono"
        :disabled="adding"
        @click="addNamespace(suggestion.name)"
      >
        {{ suggestion.name }}
        <span class="text-muted tabular-nums">{{ suggestion.count }}</span>
      </UButton>
    </div>
    <p class="text-xs text-muted">
      Order here is the order of the Translations list. Renaming or deleting a
      namespace never renames a key.
    </p>
  </div>
</template>
