<script setup lang="ts">
import { formatI18nKeyDisplay } from '#shared/utils'

const props = defineProps<{
  projectId: ID
  keyId?: ID
}>()

const open = defineModel<boolean>('open', { default: false })

const loading = ref(false)
const refs = ref<II18nKeyRefs | null>(null)
const selectedPageId = ref<ID | undefined>()

const selectedPage = computed(
  () =>
    refs.value?.pages.find(
      (p) => String(p.id) === String(selectedPageId.value)
    ) ?? refs.value?.pages[0]
)

async function loadRefs() {
  if (!validID(props.projectId) || !validID(props.keyId)) {
    refs.value = null
    return
  }
  loading.value = true
  try {
    refs.value = await useApi<II18nKeyRefs>(
      `/api/projects/${props.projectId}/i18n-keys/${props.keyId}/refs`
    )
    selectedPageId.value = refs.value?.pages[0]?.id
  } finally {
    loading.value = false
  }
}

watch(
  () => [open.value, props.keyId, props.projectId] as const,
  ([isOpen]) => {
    if (isOpen) loadRefs()
  }
)

function editSelected() {
  const page = selectedPage.value
  if (!page) return
  const tagId = page.tags[0]?.id
  open.value = false
  navigateTo({
    path: '/editor',
    query: {
      pageId: String(page.id),
      ...(validID(tagId) ? { tagId: String(tagId) } : {}),
    },
  })
}
</script>

<template>
  <USlideover
    v-model:open="open"
    :title="refs?.key ? `Tags · ${formatI18nKeyDisplay(refs.key)}` : 'Tag preview'"
    description="Read-only screenshot with boxes. Edit opens the Editor."
    side="right"
    :close="{ icon: 'i-lucide:x' }"
    class="max-w-4xl"
    :ui="{ body: 'p-0 sm:p-0', footer: 'p-4 sm:p-4' }"
  >
    <template #body>
      <div class="flex h-[min(70vh,40rem)] min-h-80">
        <aside class="w-52 shrink-0 border-r border-default overflow-auto p-2">
          <p class="px-2 py-1 text-xs font-medium text-muted uppercase">
            Pages
          </p>
          <p v-if="loading" class="px-2 py-6 text-sm text-muted">Loading…</p>
          <p
            v-else-if="!refs?.pages.length"
            class="px-2 py-6 text-sm text-muted"
          >
            No tags bound to a page.
          </p>
          <button
            v-for="page in refs?.pages ?? []"
            :key="page.id"
            type="button"
            class="w-full text-left rounded-md px-2 py-2 mb-1"
            :class="
              String(page.id) === String(selectedPage?.id)
                ? 'bg-primary/10 text-highlighted'
                : 'hover:bg-elevated'
            "
            @click="selectedPageId = page.id"
          >
            <p class="text-sm font-medium truncate">{{ page.name }}</p>
            <p class="text-xs text-muted">{{ page.tags.length }} box(es)</p>
          </button>
        </aside>
        <div class="flex-1 min-w-0 overflow-auto p-3 flex items-start justify-center bg-muted">
          <TagRefsPreview
            v-if="selectedPage"
            :image="selectedPage.image"
            :tags="selectedPage.tags"
          />
        </div>
      </div>
    </template>
    <template #footer>
      <div class="flex justify-end gap-2 w-full">
        <UButton
          color="neutral"
          variant="ghost"
          label="Close"
          @click="open = false"
        />
        <UButton
          color="primary"
          icon="i-lucide:pencil"
          label="Edit"
          :disabled="!selectedPage"
          @click="editSelected"
        />
      </div>
    </template>
  </USlideover>
</template>
