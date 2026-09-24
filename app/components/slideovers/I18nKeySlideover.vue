<script setup lang="ts">
import { TRANSLATION_LANGUAGES } from '#shared/constants'
import {
  formatI18nKeyDisplay,
  isI18nKeyDraft,
  localeDraftWrite,
  resolveEditedKey,
} from '#shared/utils'
import { releaseMembershipDiff } from '#shared/utils/release'

/**
 * One i18n key, every locale as full wrapped text and editable in place. It
 * replaces the view/edit half of `I18nKeyModal`, which could not do this: a
 * modal narrow enough to be a dialog is too narrow to read a paragraph in.
 *
 * There is no Save button on purpose. Locale text, the key, the labels and the
 * Git sync switch all commit on their own, so a Save would only be able to mean
 * "close", which is a different word.
 *
 * Mounted by the page rather than through `useOverlay`: an overlay is unmounted
 * when it closes, and this holds the prev/next position and the flush the page
 * needs before publishing.
 */
const props = defineProps<{
  projectId: ID
  /** Kept fresh by the page by id, so a reload cannot strand it. */
  row: II18nKeyRow | null
  localeCodes: string[]
  /** The language a key's original text lives in; that field *is* the original. */
  sourceLocale: string
  /** The row whose Git sync switch is in flight, so this one shows it too. */
  gitSyncBusyId: ID | null
  /** Position among the loaded rows, for prev/next; page-scoped on purpose. */
  index: number
  total: number
}>()

const emit = defineEmits<{
  navigate: [delta: -1 | 1]
  /** Git sync is a setting, not content, so the page owns the call. */
  'toggle-git-sync': [row: II18nKeyRow]
  /** A locale was written here, so the table's own copy of that cell is stale. */
  'cell-saved': [rowId: ID, locale: string]
}>()

const open = defineModel<boolean>('open', { default: false })

const toast = useToast()
const texts = ref<Record<string, string>>({})
const keyDraft = ref('')
const releaseIds = ref<number[]>([])
const openLocales = ref<string[]>([])
const saving = ref(false)
const releasing = ref(false)
const pendingSaves = new Set<Promise<unknown>>()

/*
 * `generating`, not `saving`: the two mean different things — one is "the
 * request is still running", the other is "the write is in flight".
 */
const { loading: generating, suggestion, generate } = useI18nKeyGeneration()

/**
 * The row this panel was asked about. An answer takes tens of seconds, so it can
 * land after the drawer has moved on — and an unguarded `suggestion` would then
 * label one key's answer with another key's text.
 */
const suggestionRowId = ref<ID | null>(null)
const rowSuggestion = computed(() =>
  String(suggestionRowId.value) === String(props.row?.id)
    ? suggestion.value
    : null,
)

/** The source language leads, the rest keep the project's own order — as in the table. */
const locales = computed(() => [
  props.sourceLocale,
  ...props.localeCodes.filter((code) => code !== props.sourceLocale),
])

/**
 * The source stays out of the accordion: it is the reference the others are read
 * against, so folding it would hide the one text this surface exists to show.
 */
const localeItems = computed(() =>
  locales.value
    .filter((code) => code !== props.sourceLocale)
    .map((code) => ({
      label: localeMeta(code)?.label || code,
      value: code,
      icon: localeMeta(code)?.icon,
    })),
)

/** The same predicate the server's writable gate uses: text and key follow it, labels do not. */
const writable = computed(() => Boolean(props.row?.dirty))
const gitSyncBusy = computed(
  () => Boolean(props.row) && props.gitSyncBusyId === props.row!.id,
)

function localeMeta(code: string) {
  return TRANSLATION_LANGUAGES.find((lang) => lang.value === code)
}

function draftOf(locale: string) {
  return props.row?.locales.find((l) => l.locale === locale)?.draftText ?? ''
}

/** Naming needs the text, exactly as the create dialog does: nothing to name without it. */
function onGenerate() {
  const row = props.row
  if (!row) return
  const sourceText = (texts.value[props.sourceLocale] ?? '').trim()
  if (!sourceText) return
  suggestionRowId.value = row.id
  generate({ projectId: props.projectId, sourceText })
}

function dismissSuggestion() {
  suggestion.value = null
  suggestionRowId.value = null
}

/**
 * Taking the name has to write it here: the confirm button pulls focus off the
 * key field, so no later blur will commit it.
 */
async function onPickSuggestion(key: string) {
  keyDraft.value = key
  dismissSuggestion()
  await commitKey()
}

/**
 * Every locale gets a string: a textarea bound to `undefined` goes uncontrolled.
 * The open accordion panels are deliberately left alone — comparing the same two
 * languages across rows is what prev/next is for.
 */
function fillFromRow() {
  const next: Record<string, string> = {}
  for (const code of locales.value) next[code] = draftOf(code)
  texts.value = next
  keyDraft.value = props.row ? formatI18nKeyDisplay(props.row.key) : ''
  releaseIds.value = (props.row?.releaseIds ?? []).map(Number)
}

async function flushPendingSaves() {
  if (!pendingSaves.size) return
  await Promise.allSettled([...pendingSaves])
}

watch(
  [open, () => props.row?.id] as const,
  async ([isOpen]) => {
    if (!isOpen || !props.row) return
    const id = props.row.id
    /*
     * A cell being typed into when the drawer opened has its save in flight, and
     * the row is only updated once it lands. Filling now would show the value the
     * user just replaced, and the next blur here would write it back.
     */
    await flushPendingSaves()
    // Navigating during that await already re-ran this watcher; do not clobber it.
    if (!open.value || String(props.row?.id) !== String(id)) return
    // The panel answers the row that asked for it, so moving on drops it.
    suggestion.value = null
    suggestionRowId.value = null
    fillFromRow()
  },
  { immediate: true },
)

async function saveLocale(locale: string) {
  const row = props.row
  if (!row || !row.dirty) return
  const decision = localeDraftWrite({
    locale,
    sourceLocale: props.sourceLocale,
    value: texts.value[locale] ?? '',
    previous: draftOf(locale),
  })
  switch (decision.kind) {
    case 'unchanged':
      return
    case 'source-required':
      // The endpoint ignores an empty source write, so the field goes back.
      texts.value = { ...texts.value, [locale]: draftOf(locale) }
      toast.add({
        title: 'Source text is required',
        color: 'error',
        icon: 'i-lucide:circle-alert',
      })
      return
    case 'write':
      break
    default: {
      const _exhaustive: never = decision
      throw new Error(`Unknown locale write: ${String(_exhaustive)}`)
    }
  }
  const request = useApi(`/api/translation/${row.id}/vue`, {
    method: 'POST',
    body: decision.body,
  })
  // Registered before the first await, so a flush starting now still sees it.
  pendingSaves.add(request)
  saving.value = true
  try {
    await request
  } catch (error) {
    // `useApi` has already reported it; the row keeps whatever it had.
    console.error(error)
    return
  } finally {
    pendingSaves.delete(request)
    saving.value = pendingSaves.size > 0
  }
  const text = decision.body[locale]!
  const target = row.locales.find((l) => l.locale === locale)
  if (target) {
    target.draftText = text
  } else {
    row.locales.push({ locale, draftText: text, publishedText: null })
  }
  row.dirty = isI18nKeyDraft(row.locales)
  emit('cell-saved', row.id, locale)
}

async function commitKey() {
  const row = props.row
  if (!row || !row.dirty) return
  const next = resolveEditedKey(row.key, keyDraft.value)
  if (next === null) return
  if (!next) {
    keyDraft.value = formatI18nKeyDisplay(row.key)
    toast.add({
      title: 'Key is required',
      color: 'error',
      icon: 'i-lucide:circle-alert',
    })
    return
  }
  try {
    const updated = await useApi<II18nKeyRow>(
      `/api/projects/${props.projectId}/i18n-keys/${row.id}`,
      { method: 'PATCH', body: { key: next } },
    )
    // In place, not swapped: the page and the table read this same object.
    row.key = updated.key
  } catch (error) {
    console.error(error)
    keyDraft.value = formatI18nKeyDisplay(row.key)
  }
}

/**
 * Labels are a per-release set operation with no whole-set replace on a published
 * key, so a change of N labels is N calls and no atomicity. Removals go first so
 * stopping part-way can never leave one the user asked to take off.
 */
async function commitReleases(next: number[] | undefined) {
  const row = props.row
  if (!row || releasing.value) return
  const diff = releaseMembershipDiff(row.releaseIds ?? [], next ?? [])
  const steps = [
    ...diff.remove.map((releaseId) => ({ releaseId, mode: 'remove' as const })),
    ...diff.add.map((releaseId) => ({ releaseId, mode: 'add' as const })),
  ]
  if (!steps.length) return
  releasing.value = true
  const landed = new Set((row.releaseIds ?? []).map(Number))
  let applied = 0
  let failure: unknown = null
  for (const step of steps) {
    try {
      await useApi(`/api/projects/${props.projectId}/release-membership`, {
        method: 'POST',
        body: {
          releaseId: step.releaseId,
          kind: 'key',
          ids: [Number(row.id)],
          mode: step.mode,
        },
      })
    } catch (error) {
      failure = error
      break
    }
    if (step.mode === 'add') landed.add(step.releaseId)
    else landed.delete(step.releaseId)
    applied += 1
  }
  releasing.value = false
  // Read back from what actually landed, so the picker never shows the wish.
  row.releaseIds = [...landed]
  releaseIds.value = [...landed]
  if (failure) {
    console.error(failure)
    // A first-call failure is already the error the request itself reported.
    if (applied > 0) {
      toast.add({
        title: `${applied} of ${steps.length} label change(s) applied`,
        description: 'The rest were left as they were.',
        color: 'warning',
        icon: 'i-lucide:circle-alert',
      })
    }
  }
}

defineExpose({ flushPendingSaves })
</script>

<template>
  <USlideover
    v-model:open="open"
    side="right"
    :close="{ icon: 'i-lucide:x' }"
    :title="row ? formatI18nKeyDisplay(row.key) : 'Translation'"
    class="max-w-2xl"
    :ui="{ body: 'p-4 sm:p-4', footer: 'p-4 sm:p-4' }"
  >
    <template #body>
      <div v-if="row" class="flex flex-col gap-4">
        <div
          v-if="!writable"
          class="rounded-lg border border-default bg-elevated px-3 py-2 text-xs text-muted"
        >
          Published — the text and the key are read-only. Revert it to draft to
          edit them. Releases and Git sync stay editable.
        </div>

        <div class="flex items-center gap-2">
          <UBadge
            :color="row.dirty ? 'warning' : 'success'"
            variant="subtle"
          >
            {{ row.dirty ? 'Draft' : 'Published' }}
          </UBadge>
          <UBadge variant="subtle" color="neutral">
            {{ row.tagCount }} tag(s)
          </UBadge>
        </div>

        <UFormField label="Key">
          <div class="w-full flex flex-col gap-2">
            <div class="w-full flex items-center gap-2.5">
              <UInput
                v-model="keyDraft"
                class="w-full font-mono"
                :disabled="!writable"
                @keydown.enter="commitKey"
                @keydown.esc="keyDraft = formatI18nKeyDisplay(row.key)"
                @blur="commitKey"
              />
              <!--
                One generation at a time: they share `suggestion`, so a second
                would let whichever answer lands last decide what is on screen.
              -->
              <AIButton
                v-if="writable"
                :loading="generating"
                :disabled="generating"
                @click="onGenerate"
              />
            </div>
            <AIKeySuggestion
              v-if="rowSuggestion"
              :suggestion="rowSuggestion"
              :source-text="texts[sourceLocale] ?? ''"
              @pick="onPickSuggestion"
              @cancel="dismissSuggestion"
            />
          </div>
        </UFormField>

        <UFormField label="Releases">
          <!--
            Disabled rather than dropping a second toggle: the picker emits the
            whole new set, and swallowing one would lose the user's change.
          -->
          <ReleaseSelect
            :model-value="releaseIds"
            :disabled="releasing"
            @update:model-value="commitReleases"
          />
        </UFormField>

        <UFormField
          label="Git sync"
          description="Off keeps this key out of pull and push. It is still served on the published API."
        >
          <USwitch
            :model-value="row.gitSyncEnabled"
            :loading="gitSyncBusy"
            @update:model-value="emit('toggle-git-sync', row)"
          />
        </UFormField>

        <!--
          The source leads and stays open; the rest fold away so a ten-language
          key does not become one long scroll.
        -->
        <div class="flex flex-col gap-1.5">
          <div class="flex items-center gap-1.5 text-xs text-muted">
            <UIcon
              :name="localeMeta(sourceLocale)?.icon || 'i-lucide:languages'"
              size="14"
            />
            <span class="font-medium">
              {{ localeMeta(sourceLocale)?.label || sourceLocale }}
            </span>
            <UBadge variant="subtle" size="sm" color="neutral">Source</UBadge>
          </div>
          <!--
            Nuxt UI pairs `autoresize` with `resize-none`, so the drag handle has
            to be taken back explicitly: auto-grow covers the usual case, the
            handle covers text longer than `maxrows`.
          -->
          <UTextarea
            v-model="texts[sourceLocale]"
            class="w-full"
            :ui="{ base: 'resize-y' }"
            :rows="3"
            :maxrows="10"
            autoresize
            :disabled="!writable"
            @blur="saveLocale(sourceLocale)"
          />
        </div>

        <!--
          Multiple, not single: reading two languages against each other is what
          this surface is for, and one-at-a-time would mean switching back and
          forth.
        -->
        <UAccordion v-model="openLocales" type="multiple" :items="localeItems">
          <template #body="{ item }">
            <UTextarea
              v-model="texts[item.value]"
              class="w-full"
              :ui="{ base: 'resize-y' }"
              :rows="3"
              :maxrows="10"
              autoresize
              :disabled="!writable"
              @blur="saveLocale(item.value)"
            />
          </template>
        </UAccordion>
      </div>
    </template>
    <template #footer>
      <div class="w-full flex items-center gap-2">
        <UButton
          color="neutral"
          variant="ghost"
          icon="i-lucide:chevron-left"
          square
          aria-label="Previous key"
          :disabled="index <= 0"
          @click="emit('navigate', -1)"
        />
        <UButton
          color="neutral"
          variant="ghost"
          icon="i-lucide:chevron-right"
          square
          aria-label="Next key"
          :disabled="index >= total - 1"
          @click="emit('navigate', 1)"
        />
        <p class="text-xs text-muted">{{ index + 1 }} / {{ total }}</p>
        <p
          v-if="saving || releasing"
          class="ml-1 flex items-center gap-1 text-xs text-muted"
        >
          <UIcon name="i-lucide:loader-circle" class="size-3 animate-spin" />
          Saving…
        </p>
        <UButton
          class="ml-auto"
          color="neutral"
          variant="ghost"
          label="Close"
          @click="open = false"
        />
      </div>
    </template>
  </USlideover>
</template>