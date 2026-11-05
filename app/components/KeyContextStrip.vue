<script setup lang="ts">
import { clipUrlForOcr } from '~/core/ocrClip'

/**
 * A small look at where a key sits on screen, for the Translations inspector.
 * Deliberately a thumbnail: the inspector is about the text, and the full view
 * is one click away in the Tags drawer.
 */
const props = defineProps<{
  projectId: ID
  keyId: ID
  tagCount: number
  /** Published keys are read-only, so there is nothing to put a reading into. */
  ocrWritable: boolean
}>()

const emit = defineEmits<{
  /** Carries the key it was read for: the user may have moved on meanwhile. */
  ocr: [result: { keyId: ID; text: string }]
}>()

const toast = useToast()
const ossImage = useOSSImage()
const projectStore = useProjectStore()
const loading = ref(false)
const recognizing = ref(false)
const refs = ref<II18nKeyRefs | null>(null)
const pageId = ref<ID | undefined>()
const drawerOpen = ref(false)

const pages = computed(() => refs.value?.pages ?? [])
const page = computed(
  () =>
    pages.value.find((item) => String(item.id) === String(pageId.value)) ??
    pages.value[0],
)

/**
 * One tag at a time: framing every tag on the page zooms out to the whole
 * screenshot once two of them sit far apart. OCR and the editor link follow it.
 */
const tagIndex = ref(0)
const tagTotal = computed(() => page.value?.tags.length ?? 0)
const tag = computed(
  () => page.value?.tags[tagIndex.value] ?? page.value?.tags[0],
)
const focusIds = computed(() => (tag.value ? [tag.value.id] : []))

watch(
  () => page.value?.id,
  () => {
    tagIndex.value = 0
  },
)

function stepTag(delta: number) {
  const total = tagTotal.value
  if (total < 2) return
  tagIndex.value = (tagIndex.value + delta + total) % total
}

/** Keys change under it on ↑ ↓, so an answer for the previous one is dropped. */
let requestSeq = 0

async function load() {
  const seq = ++requestSeq
  refs.value = null
  pageId.value = undefined
  tagIndex.value = 0
  if (
    props.tagCount <= 0 ||
    !validID(props.projectId) ||
    !validID(props.keyId)
  ) {
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

watch(() => [props.projectId, props.keyId, props.tagCount] as const, load, {
  immediate: true,
})

/** Reads the tag in view; tags of one key share its text. */
async function recognize() {
  const current = page.value
  const target = tag.value
  if (!current?.image || !target || recognizing.value) return
  const keyId = props.keyId
  recognizing.value = true
  try {
    const image = await clipUrlForOcr(await ossImage.get(current.image), target)
    const result = await useApi<{ text: string; fingerprint: string } | null>(
      '/api/common/ocr',
      {
        method: 'POST',
        body: {
          image,
          language:
            current.ocrLanguage ??
            projectStore.curProject.settings?.ocrLanguage,
        },
      },
    )
    if (!result) {
      toast.add({
        title: 'No text found in the tag',
        color: 'warning',
        icon: 'i-lucide:scan-text',
      })
      return
    }
    emit('ocr', { keyId, text: result.text })
  } catch (error) {
    // A failed request is already reported by `useApi`; this catches the image.
    console.error(error)
  } finally {
    recognizing.value = false
  }
}

function openInEditor() {
  const current = page.value
  if (!current) return
  const tagId = tag.value?.id
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
      <div class="relative h-36 w-full @md:h-24 @md:w-44 shrink-0">
        <button
          type="button"
          class="relative size-full overflow-hidden rounded-md border border-default bg-muted"
          :class="
            page
              ? 'cursor-zoom-in hover:ring-1 hover:ring-primary'
              : 'cursor-default'
          "
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
            :focus-ids="focusIds"
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
        <!-- A sibling, not inside the thumbnail: a button cannot hold buttons. -->
        <div
          v-if="tagTotal > 1"
          class="absolute bottom-1 right-1 flex items-center rounded-md bg-default/80 backdrop-blur ring ring-default"
        >
          <UButton
            size="xs"
            color="neutral"
            variant="ghost"
            icon="i-lucide:chevron-left"
            aria-label="Previous tag"
            class="p-0.5"
            @click="stepTag(-1)"
          />
          <span class="px-0.5 text-[11px] text-muted tabular-nums">
            {{ tagIndex + 1 }}/{{ tagTotal }}
          </span>
          <UButton
            size="xs"
            color="neutral"
            variant="ghost"
            icon="i-lucide:chevron-right"
            aria-label="Next tag"
            class="p-0.5"
            @click="stepTag(1)"
          />
        </div>
      </div>

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
              :color="
                String(item.id) === String(page.id) ? 'primary' : 'neutral'
              "
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
            <UTooltip
              :text="
                ocrWritable
                  ? 'Read the text from this screenshot to check the source'
                  : 'Published keys are read-only'
              "
            >
              <!-- A disabled button fires no hover, so the span carries the tooltip. -->
              <span>
                <UButton
                  size="xs"
                  color="neutral"
                  variant="ghost"
                  icon="i-lucide:scan-text"
                  label="OCR"
                  :loading="recognizing"
                  :disabled="!ocrWritable || !page.image"
                  @click="recognize"
                />
              </span>
            </UTooltip>
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
          Not on any screenshot yet. Tag it in the editor to give translators
          the context.
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
