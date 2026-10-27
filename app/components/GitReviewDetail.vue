<script setup lang="ts">
import { GitSyncConflictStatus } from '#shared/constants'
import type {
  IGitReviewItem,
  IGitReviewSection,
  IGitSyncConflictRow,
} from '#shared/types/GitSync'
import { formatI18nKeyDisplay } from '#shared/utils'

type ResolveAction =
  | typeof GitSyncConflictStatus.OURS
  | typeof GitSyncConflictStatus.THEIRS
  | typeof GitSyncConflictStatus.MERGED
  | typeof GitSyncConflictStatus.RENAMED

/**
 * The Git page's right pane. An open conflict gets the three-way view with its
 * resolve actions; any other row is a read-only comparison of the sides.
 */
const props = defineProps<{
  item: IGitReviewItem | null
  conflict: IGitSyncConflictRow | null
  /** Sides to compare when the row is not a conflict. */
  sections: IGitReviewSection[]
  resolving: boolean
}>()

const showCompare = defineModel<boolean>('compare', { default: false })

const emit = defineEmits<{
  resolve: [
    conflict: IGitSyncConflictRow,
    action: ResolveAction,
    text?: string,
    newKey?: string,
  ]
}>()

// Full class names, so Tailwind sees them. Each side keeps one colour and icon
// everywhere, so the eye learns "blue is Git, green is the platform".
const TONES: Record<
  IGitReviewSection['tone'],
  { icon: string; box: string; label: string }
> = {
  git: {
    icon: 'i-lucide:git-branch',
    box: 'border-l-info bg-info/5',
    label: 'text-info',
  },
  platform: {
    icon: 'i-lucide:layout-dashboard',
    box: 'border-l-primary bg-primary/5',
    label: 'text-primary',
  },
  reference: {
    icon: 'i-lucide:history',
    box: 'border-l-accented bg-muted',
    label: 'text-muted',
  },
  warning: {
    icon: 'i-lucide:triangle-alert',
    box: 'border-l-warning bg-warning/5',
    label: 'text-warning',
  },
}

const conflictSections = computed<IGitReviewSection[]>(() => {
  const conflict = props.conflict
  if (!conflict) return []
  const sections: IGitReviewSection[] = [
    {
      label: 'In Git',
      hint: 'The text currently in the Git repo.',
      text: conflict.theirsText,
      tone: 'git',
    },
    {
      label: 'On platform (draft)',
      hint: 'The draft text in Localness.',
      text: conflict.oursText,
      tone: 'platform',
    },
    {
      label: 'Last synced',
      hint: 'What both sides had at the last Pull/Push. Compare it to see which side changed.',
      text: conflict.baseText,
      tone: 'reference',
      optional: true,
    },
  ]
  if (conflict.publishedText) {
    sections.push({
      label: 'Currently published',
      hint: 'The published text the public API serves. For comparison only; not a choice.',
      text: conflict.publishedText,
      tone: 'reference',
      optional: true,
    })
  }
  return sections
})

const allSections = computed(() =>
  props.conflict ? conflictSections.value : props.sections
)
const hasOptional = computed(() => allSections.value.some((s) => s.optional))
const shownSections = computed(() =>
  showCompare.value
    ? allSections.value
    : allSections.value.filter((s) => !s.optional)
)

const editing = ref(false)
const editText = ref('')
const renaming = ref(false)
const renameText = ref('')

// Lets the page keep letter shortcuts from resolving over an unsaved edit.
const busy = defineModel<boolean>('busy', { default: false })
watch([editing, renaming], ([isEditing, isRenaming]) => {
  busy.value = isEditing || isRenaming
})

function cancelInline() {
  editing.value = false
  renaming.value = false
}

watch(() => props.item?.id, cancelInline)

function startEdit(conflict: IGitSyncConflictRow) {
  editing.value = true
  editText.value = conflict.oursText
}

/**
 * "Step aside": only the platform's copy moves — Git keeps its text under
 * this key either way. The name is typed by hand — a generated one would only
 * be guessing at what the key means now.
 */
function startRename() {
  renaming.value = true
  renameText.value = ''
}

function confirmRename(conflict: IGitSyncConflictRow) {
  const newKey = renameText.value.trim()
  if (!newKey) return
  emit('resolve', conflict, GitSyncConflictStatus.RENAMED, undefined, newKey)
}
</script>

<template>
  <div class="flex flex-col">
    <p
      v-if="!item"
      class="m-4 rounded-xl border border-dashed border-default px-4 py-10 text-center text-sm text-muted"
    >
      Select a row to compare its sides.
    </p>
    <template v-else>
      <div
        class="sticky top-0 z-10 flex flex-wrap items-center gap-2 px-4 py-3 bg-default border-b border-default"
      >
        <code class="min-w-0 truncate text-sm font-semibold" :title="item.key">
          {{ formatI18nKeyDisplay(item.key) }}
        </code>
        <LocaleBadge v-if="item.locale" :locale="item.locale" />
        <UButton
          v-if="hasOptional"
          class="ml-auto"
          size="xs"
          color="neutral"
          :variant="showCompare ? 'soft' : 'outline'"
          icon="i-lucide:git-compare"
          label="Compare"
          @click="showCompare = !showCompare"
        />
        <UBadge
          :class="hasOptional ? 'shrink-0' : 'ml-auto shrink-0'"
          variant="subtle"
          size="sm"
          :color="item.color"
        >
          {{ item.label }}
        </UBadge>
      </div>

      <div class="p-4 grid grid-cols-1 xl:grid-cols-2 gap-3">
        <section
          v-for="(section, index) in shownSections"
          :key="section.label"
          class="rounded-lg border-l-4 px-3 py-2.5"
          :class="[
            TONES[section.tone].box,
            conflict && index < 2 ? '' : 'xl:col-span-2',
          ]"
        >
          <h3
            class="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider"
            :class="TONES[section.tone].label"
          >
            <UIcon :name="TONES[section.tone].icon" class="size-3.5" />
            {{ section.label }}
          </h3>
          <p v-if="section.hint" class="mt-0.5 text-xs text-muted">
            {{ section.hint }}
          </p>
          <p
            class="mt-1.5 text-sm whitespace-pre-wrap break-words"
            :class="{ 'text-dimmed italic': !section.text }"
          >
            {{ section.text || 'Empty' }}
          </p>
        </section>
      </div>

      <div v-if="conflict" class="px-4 pb-4 flex flex-col gap-3">
        <UAlert
          v-if="conflict.olderSourceText"
          color="warning"
          variant="subtle"
          icon="i-lucide:history"
          title="Git's translation was written for an older source"
        >
          <template #description>
            <div class="flex flex-col gap-2">
              <div>
                <p class="text-xs font-semibold uppercase tracking-wider">
                  Translated from (older source)
                </p>
                <p
                  class="mt-1 rounded border-l-2 border-warning bg-default/60 px-2 py-1 whitespace-pre-wrap break-words"
                >
                  {{ conflict.olderSourceText }}
                </p>
              </div>
              <ul class="list-disc pl-4 text-xs space-y-0.5">
                <li>A newer batch is still with LILT.</li>
                <li>Use Git lands the text marked as outdated.</li>
                <li>
                  If you edit the text, it counts as written for the current
                  source.
                </li>
              </ul>
            </div>
          </template>
        </UAlert>
        <UTextarea
          v-if="editing"
          v-model="editText"
          class="w-full"
          :rows="4"
        />
        <template v-if="renaming">
          <UInput
            v-model="renameText"
            class="w-full font-mono"
            placeholder="New name for the platform's key"
          />
          <p class="text-xs text-muted">
            Only the platform's key is renamed, and it leaves Git sync. Git
            keeps its own copy under
            <span class="font-mono">{{ conflict.key }}</span>.
          </p>
        </template>
        <div class="flex flex-wrap gap-2">
          <UButton
            size="sm"
            color="info"
            variant="soft"
            icon="i-lucide:git-branch"
            :loading="resolving"
            @click="emit('resolve', conflict, GitSyncConflictStatus.THEIRS)"
          >
            Use Git
          </UButton>
          <UButton
            size="sm"
            color="primary"
            variant="soft"
            icon="i-lucide:layout-dashboard"
            :loading="resolving"
            @click="emit('resolve', conflict, GitSyncConflictStatus.OURS)"
          >
            Use platform
          </UButton>
          <UButton
            v-if="!editing"
            size="sm"
            color="neutral"
            variant="ghost"
            @click="startEdit(conflict)"
          >
            Edit
          </UButton>
          <UButton
            v-else
            size="sm"
            color="primary"
            :loading="resolving"
            @click="
              emit('resolve', conflict, GitSyncConflictStatus.MERGED, editText)
            "
          >
            Save edit
          </UButton>
          <UButton
            v-if="!renaming"
            size="sm"
            color="neutral"
            variant="ghost"
            @click="startRename"
          >
            Rename…
          </UButton>
          <UButton
            v-else
            size="sm"
            color="primary"
            :loading="resolving"
            :disabled="!renameText.trim()"
            @click="confirmRename(conflict)"
          >
            Keep both
          </UButton>
          <UButton
            v-if="editing || renaming"
            size="sm"
            color="neutral"
            variant="ghost"
            @click="cancelInline"
          >
            Cancel
          </UButton>
        </div>
      </div>
    </template>
  </div>
</template>
