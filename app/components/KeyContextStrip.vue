<script setup lang="ts">
/**
 * A small look at where a key sits on screen, for the Translations inspector.
 * Deliberately a thumbnail: the inspector is about the text, and the full view
 * is one click away in the Tags drawer.
 */
const props = defineProps<{
  projectId: ID
  keyId: ID
  tagCount: number
}>()

const loading = ref(false)
const refs = ref<II18nKeyRefs | null>(null)
const pageId = ref<ID | undefined>()
const drawerOpen = ref(false)

const pages = computed(() => refs.value?.pages ?? [])
const page = computed(
  () =>
    pages.value.find((item) => String(item.id) === String(pageId.value)) ??
    pages.value[0],
)

/** Keys change under it on ↑ ↓, so an answer for the previous one is dropped. */
let requestSeq = 0

async function load() {
  const seq = ++requestSeq
  refs.value = null
  pageId.value = undefined
  if (props.tagCount <= 0 || !validID(props.projectId) || !validID(props.keyId)) {
    loading.value = false
    return
  }
  loading.value = true
  try {
    const result = await useApi<II18nKeyRefs>(
      `/api/projects/${props.projectId}/i18n-keys/${props.keyId}/refs`,
    )
    if (seq !== requestSeq) return
    refs.value = result ?? null
  } finally {
    if (seq === requestSeq) loading.value = false
  }
}

watch(
  () => [props.projectId, props.keyId, props.tagCount] as const,
  load,
  { immediate: true },
)

function openInEditor() {
  const current = page.value
  if (!current) return
  const tagId = current.tags[0]?.id
  navigateTo({
    path: '/editor',
    query: {
      pageId: String(current.id),
      ...(validID(tagId) ? { tagId: String(tagId) } : {}),
    },
  })
}
</script>

<template>
  <!-- Its own container: stacked in the inspector's side column, a row when full width. -->
  <div class="@container">
  <div class="flex flex-col gap-2 @md:flex-row @md:items-stretch @md:gap-3">
    <button
      type="button"
      class="relative h-36 w-full @md:h-24 @md:w-44 shrink-0 overflow-hidden rounded-md border border-default bg-muted"
      :class="page ? 'cursor-zoom-in hover:ring-1 hover:ring-primary' : 'cursor-default'"
      :disabled="!page"
      :aria-label="page ? 'Show larger' : 'No screenshot'"
      @click="drawerOpen = true"
    >
      <TagFocusPreview
        v-if="page"
        :key="page.id"
        compact
        :image="page.image"
        :tags="page.tags"
      />
      <span
        v-else
        class="absolute inset-0 flex items-center justify-center text-muted"
      >
        <UIcon
          :name="loading ? 'i-lucide:loader-circle' : 'i-lucide:image-off'"
          class="size-5"
          :class="{ 'animate-spin': loading }"
        />
      </span>
    </button>

    <div class="min-w-0 flex-1 flex flex-col justify-center gap-1.5">
      <template v-if="page">
        <p
          class="text-[11px] font-semibold uppercase tracking-wider text-muted"
        >
          {{ pages.length > 1 ? 'Switch screenshot' : 'Screenshot' }}
        </p>
        <div class="flex flex-wrap items-center gap-1">
          <UButton
            v-for="item in pages"
            :key="item.id"
            size="xs"
            :color="String(item.id) === String(page.id) ? 'primary' : 'neutral'"
            :variant="String(item.id) === String(page.id) ? 'soft' : 'ghost'"
            :label="item.name"
            class="max-w-40"
            :ui="{ label: 'truncate' }"
            @click="pageId = item.id"
          />
        </div>
        <p class="text-xs text-muted">
          {{ tagCount }} tag{{ tagCount === 1 ? '' : 's' }} on
          {{ pages.length }} screenshot{{ pages.length === 1 ? '' : 's' }}
        </p>
        <div class="flex items-center gap-1">
          <UButton
            size="xs"
            color="neutral"
            variant="ghost"
            icon="i-lucide:maximize-2"
            label="Larger"
            @click="drawerOpen = true"
          />
          <UButton
            size="xs"
            color="neutral"
            variant="ghost"
            icon="i-lucide:pencil"
            label="Open in editor"
            @click="openInEditor"
          />
        </div>
      </template>
      <p v-else-if="!loading" class="text-xs text-muted">
        Not on any screenshot yet. Tag it in the editor to give translators the
        context.
      </p>
    </div>

    <!-- Teleports to <body>, so nesting it here costs no layout. -->
    <TagRefsSlideover
      v-model:open="drawerOpen"
      :project-id="projectId"
      :key-id="keyId"
    />
  </div>
  </div>
</template>
