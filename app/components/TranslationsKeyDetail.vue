<script setup lang="ts">
import { TRANSLATION_LANGUAGES } from '#shared/constants'
import {
  DRAFT_KEY_PREFIX,
  formatI18nKeyDisplay,
  fpTranslation,
  hasUnpublishedDraft,
  isI18nKeyDraft,
  localeDraftWrite,
  resolveEditedKey,
} from '#shared/utils'
import {
  localeCoverageState,
  type LocaleCoverageState,
} from '#shared/utils/coverage'
import { releaseMembershipDiff } from '#shared/utils/release'

/**
 * The Translations page's right pane: one key, read from its name and source
 * text down to the other languages. The screenshot is a thumbnail on purpose —
 * this pane is about the text.
 *
 * There is no Save button. Locale text, the key, the labels and the Git sync
 * switch all commit on their own; the page flushes in-flight writes through
 * `flushPendingSaves` before anything that reads them back, like publishing.
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
  publishing: boolean
  /** Bumped when the list reloads, so text written elsewhere is picked up. */
  loadCount: number
}>()

const emit = defineEmits<{
  publish: [row: II18nKeyRow]
  /** The page owns the confirm dialogs and the reload that follows them. */
  unpublish: [row: II18nKeyRow]
  delete: [row: II18nKeyRow]
  /** Git sync is a setting, not content, so the page owns the call. */
  'toggle-git-sync': [row: II18nKeyRow]
}>()

type LocaleFilter = 'all' | 'missing' | 'outdated'

const toast = useToast()
const texts = ref<Record<string, string>>({})
const keyDraft = ref('')
const releaseIds = ref<number[]>([])
const saving = ref(false)
const releasing = ref(false)
const pendingSaves = new Set<Promise<unknown>>()
const localeFilter = ref<LocaleFilter>('all')
/**
 * Which languages the filter shows, taken when the filter or the key changes
 * rather than live: filling in a Missing one must not make it vanish on blur.
 */
const shownLocales = ref<string[]>([])

/*
 * `generating`, not `saving`: the two mean different things — one is "the
 * request is still running", the other is "the write is in flight".
 */
const { loading: generating, suggestion, generate } = useI18nKeyGeneration()

/**
 * The row this panel was asked about. An answer takes tens of seconds, so it can
 * land after the pane has moved on — and an unguarded `suggestion` would then
 * label one key's answer with another key's text.
 */
const suggestionRowId = ref<ID | null>(null)
const rowSuggestion = computed(() =>
  String(suggestionRowId.value) === String(props.row?.id)
    ? suggestion.value
    : null,
)

/** Every language but the source, in the project's own order. */
const otherLocales = computed(() =>
  props.localeCodes.filter((code) => code !== props.sourceLocale),
)

/** The same predicate the server's writable gate uses: text and key follow it, labels do not. */
const writable = computed(() => Boolean(props.row?.dirty))
const gitSyncBusy = computed(
  () => Boolean(props.row) && props.gitSyncBusyId === props.row!.id,
)
const canPublish = computed(
  () => Boolean(props.row) && hasUnpublishedDraft(props.row!.locales),
)
const isPlaceholderKey = computed(
  () => props.row?.key.startsWith(DRAFT_KEY_PREFIX) ?? false,
)

function localeMeta(code: string) {
  return TRANSLATION_LANGUAGES.find((lang) => lang.value === code)
}

function stateOf(code: string): LocaleCoverageState {
  return props.row
    ? localeCoverageState(props.row, code, props.sourceLocale)
    : 'missing'
}

const counts = computed(() => {
  const states = otherLocales.value.map(stateOf)
  return {
    filled: states.filter((state) => state !== 'missing').length,
    missing: states.filter((state) => state === 'missing').length,
    outdated: states.filter((state) => state === 'outdated').length,
  }
})

const filterItems = computed(() => [
  { label: 'All', value: 'all' as const },
  { label: `Missing ${counts.value.missing}`, value: 'missing' as const },
  { label: `Outdated ${counts.value.outdated}`, value: 'outdated' as const },
])

function applyLocaleFilter() {
  const filter = localeFilter.value
  switch (filter) {
    case 'all':
      shownLocales.value = otherLocales.value
      return
    case 'missing':
    case 'outdated':
      shownLocales.value = otherLocales.value.filter(
        (code) => stateOf(code) === filter,
      )
      return
    default: {
      const _exhaustive: never = filter
      throw new Error(`Unknown locale filter: ${String(_exhaustive)}`)
    }
  }
}

watch(localeFilter, applyLocaleFilter)
watch(otherLocales, applyLocaleFilter)

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

/** Every locale gets a string: a textarea bound to `undefined` goes uncontrolled. */
function fillFromRow() {
  const next: Record<string, string> = {}
  for (const code of props.localeCodes) next[code] = draftOf(code)
  texts.value = next
  keyDraft.value = props.row ? formatI18nKeyDisplay(props.row.key) : ''
  releaseIds.value = (props.row?.releaseIds ?? []).map(Number)
  applyLocaleFilter()
}

async function flushPendingSaves() {
  if (!pendingSaves.size) return
  await Promise.allSettled([...pendingSaves])
}

watch(
  () => [props.row?.id, props.loadCount] as const,
  async ([id], previous) => {
    if (id == null) return
    /*
     * A field being typed into when the focus moved has its save in flight, and
     * the row is only updated once it lands. Filling now would show the value
     * the user just replaced, and the next blur here would write it back.
     */
    await flushPendingSaves()
    // Moving on during that await already re-ran this watcher; do not clobber it.
    if (String(props.row?.id) !== String(id)) return
    if (String(previous?.[0]) !== String(id)) {
      // The panel answers the row that asked for it, so moving on drops it.
      dismissSuggestion()
    }
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
  // In place, not reloaded: the list reads this same object for its dots.
  const text = decision.body[locale]!
  const target = row.locales.find((l) => l.locale === locale)
  const stamp = locale === props.sourceLocale ? undefined : (row.fingerprint ?? '')
  if (target) {
    target.draftText = text
    if (stamp !== undefined) target.sourceFingerprint = stamp
  } else {
    row.locales.push({
      locale,
      draftText: text,
      publishedText: null,
      sourceFingerprint: stamp ?? '',
    })
  }
  if (locale === props.sourceLocale && text.trim()) {
    row.fingerprint = fpTranslation(text)
  }
  row.dirty = isI18nKeyDraft(row.locales)
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
    // In place, not reloaded: a rename bumps `updatedAt`, and a reload would
    // re-sort the row away from under the user.
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
  <div
    v-if="!row"
    class="h-full flex flex-col items-center justify-center gap-2 p-8 text-center text-sm text-muted"
  >
    <UIcon name="i-lucide:mouse-pointer-click" class="size-8" />
    <p>Pick a key on the left to see its text and languages.</p>
  </div>

  <!--
    A container, so the layout follows this pane's width rather than the
    window's: the list beside it takes a fixed share.
  -->
  <div v-else class="flex flex-col">
    <!-- The bar and hint strip mirror the Consistency finding detail. -->
    <div
      class="sticky top-0 z-10 flex flex-wrap items-center gap-2 px-4 py-3 bg-default border-b border-default"
    >
      <UBadge
        :color="row.dirty ? 'warning' : 'success'"
        variant="subtle"
        size="md"
      >
        {{ row.dirty ? 'Draft' : 'Published' }}
      </UBadge>
      <div class="min-w-48 flex-1 flex items-center gap-1">
        <UInput
          v-model="keyDraft"
          class="min-w-0 flex-1"
          size="sm"
          variant="ghost"
          :ui="{ base: 'font-mono font-semibold' }"
          :disabled="!writable"
          aria-label="Key"
          @keydown.enter="commitKey"
          @keydown.esc="keyDraft = formatI18nKeyDisplay(row.key)"
          @blur="commitKey"
        />
        <!--
          One generation at a time: they share `suggestion`, so a second would
          let whichever answer lands last decide what is on screen.
        -->
        <AIButton
          v-if="writable"
          :loading="generating"
          :disabled="generating"
          @click="onGenerate"
        />
      </div>
      <span class="ml-auto flex shrink-0 items-center gap-1">
        <span
          v-if="saving || releasing"
          class="mr-1 flex items-center gap-1 text-xs text-muted"
        >
          <UIcon name="i-lucide:loader-circle" class="size-3 animate-spin" />
          Saving…
        </span>
        <template v-if="row.dirty">
          <UButton
            size="xs"
            color="error"
            variant="ghost"
            icon="i-lucide:trash-2"
            label="Delete"
            @click="emit('delete', row)"
          />
          <UTooltip
            :text="
              canPublish
                ? 'Publish this key'
                : 'Nothing to publish — no draft text on this key'
            "
          >
            <UButton
              size="xs"
              color="primary"
              icon="i-lucide:upload"
              label="Publish"
              :loading="publishing"
              :disabled="!canPublish"
              @click="emit('publish', row)"
            />
          </UTooltip>
        </template>
        <UButton
          v-else
          size="xs"
          color="warning"
          variant="soft"
          icon="i-lucide:undo-2"
          label="Revert to draft"
          :disabled="publishing"
          @click="emit('unpublish', row)"
        />
      </span>
    </div>

    <p
      v-if="!row.dirty"
      class="px-4 py-2 text-xs text-muted border-b border-default"
    >
      Published keys are read-only. Revert to edit the text or the name.
    </p>
    <p
      v-else-if="isPlaceholderKey && writable && !rowSuggestion"
      class="px-4 py-2 text-xs text-warning border-b border-default"
    >
      Placeholder name from the editor. Rename it, or let AI suggest one.
    </p>
    <div v-if="rowSuggestion" class="px-4 py-3 border-b border-default">
      <AIKeySuggestion
        :suggestion="rowSuggestion"
        :source-text="texts[sourceLocale] ?? ''"
        @pick="onPickSuggestion"
        @cancel="dismissSuggestion"
      />
    </div>

    <!--
      A container, so the layout follows this pane's width rather than the
      window's: the list beside it takes a fixed share.
    -->
    <div class="@container p-4">
    <!--
      Narrow: context and settings first, then the text. Wide: the text takes
      the main column and they move to a side column that stays in view.
    -->
    <div
      class="grid gap-4 @3xl:grid-cols-[minmax(0,1fr)_22rem] @3xl:items-start"
    >
      <aside
        class="@container min-w-0 flex flex-col gap-4 @3xl:col-start-2 @3xl:row-start-1 @3xl:sticky @3xl:top-[4.25rem]"
      >
        <KeyContextStrip
          :project-id="projectId"
          :key-id="row.id"
          :tag-count="row.tagCount"
        />
        <USeparator />
        <div
          class="grid gap-3 rounded-lg bg-muted px-3 py-2.5 @md:grid-cols-[minmax(0,1fr)_auto] @md:items-end"
        >
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
          <div class="flex items-center justify-between gap-3 @md:h-8">
            <span class="inline-flex items-center gap-1.5 text-sm">
              Git sync
              <UTooltip
                text="Off keeps this key out of pull and push. It is still served on the published API."
              >
                <UIcon name="i-lucide:info" class="size-3.5 text-muted" />
              </UTooltip>
            </span>
            <USwitch
              :model-value="row.gitSyncEnabled"
              :loading="gitSyncBusy"
              @update:model-value="emit('toggle-git-sync', row)"
            />
          </div>
        </div>
      </aside>

      <div
        class="@container min-w-0 flex flex-col gap-4 @3xl:col-start-1 @3xl:row-start-1"
      >
        <!-- The source leads: it is what every other language is read against. -->
        <section class="flex flex-col gap-1.5">
          <div class="flex items-center gap-1.5 text-xs text-muted">
            <h2 class="font-semibold uppercase tracking-wider">Source</h2>
            <UIcon
              :name="localeMeta(sourceLocale)?.icon || 'i-lucide:languages'"
              size="14"
              class="ml-1"
            />
            <span>{{ localeMeta(sourceLocale)?.label || sourceLocale }}</span>
          </div>
          <!--
            Nuxt UI pairs `autoresize` with `resize-none`, so the drag handle has
            to be taken back explicitly: auto-grow covers the usual case, the
            handle covers text longer than `maxrows`.
          -->
          <UTextarea
            v-model="texts[sourceLocale]"
            class="w-full"
            :ui="{ base: 'resize-y text-base' }"
            :rows="5"
            :maxrows="10"
            autoresize
            :disabled="!writable"
            @blur="saveLocale(sourceLocale)"
          />
        </section>

        <section
          v-if="otherLocales.length"
          class="flex flex-col gap-3 border-t border-default pt-4"
        >
          <div class="flex flex-wrap items-center gap-2">
            <h2
              class="text-xs font-semibold uppercase tracking-wider text-muted"
            >
              Translations
            </h2>
            <span class="text-xs text-muted tabular-nums">
              {{ counts.filled }}/{{ otherLocales.length }}
            </span>
            <UPopover mode="hover" :open-delay="150">
              <UButton
                size="xs"
                color="neutral"
                variant="ghost"
                icon="i-lucide:info"
                aria-label="Legend"
              />
              <template #content>
                <div class="w-80 p-3">
                  <LocaleStateLegend />
                </div>
              </template>
            </UPopover>
            <UTabs
              v-model="localeFilter"
              class="ml-auto"
              size="xs"
              variant="pill"
              :content="false"
              :items="filterItems"
            />
          </div>
          <p
            v-if="!shownLocales.length"
            class="py-4 text-center text-xs text-muted"
          >
            {{
              localeFilter === 'missing'
                ? 'Every language has text.'
                : 'Nothing written against an older source.'
            }}
          </p>
          <!-- Columns follow the width: one when narrow, more as it widens. -->
          <div
            v-else
            class="grid gap-x-4 gap-y-3 @2xl:grid-cols-2 @6xl:grid-cols-3"
          >
            <div
              v-for="code in shownLocales"
              :key="code"
              class="min-w-0 flex flex-col gap-1"
            >
              <div class="flex items-center gap-1.5 text-xs">
                <UIcon
                  v-if="localeMeta(code)?.icon"
                  :name="localeMeta(code)!.icon"
                  size="14"
                />
                <span class="truncate font-medium">
                  {{ localeMeta(code)?.label || code }}
                </span>
                <LocaleStateDot
                  class="ml-auto"
                  :state="stateOf(code)"
                  show-text
                />
              </div>
              <UTextarea
                v-model="texts[code]"
                class="w-full"
                :ui="{ base: 'resize-y' }"
                :rows="2"
                :maxrows="8"
                autoresize
                :disabled="!writable"
                :placeholder="writable ? 'Not translated yet' : '—'"
                @blur="saveLocale(code)"
              />
            </div>
          </div>
        </section>
      </div>
    </div>
    </div>
  </div>
</template>
