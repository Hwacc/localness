<script setup lang="ts">
import { TRANSLATION_LANGUAGES } from '#shared/constants'
import {
  isUnnamedKey,
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
import type { AiSingleDone } from '~/composables/useAiTranslate'

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
  /** AI wrote or reverted a draft on the server; the page reloads the list. */
  'ai-changed': []
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

const { status: aiStatus } = useAiTranslateStatus(
  computed(() => props.projectId),
)
const aiReady = computed(() =>
  Boolean(aiStatus.value?.enabled && aiStatus.value.configured),
)
/** One cell at a time: the text streams into its own field. */
const aiRun = ref<{ code: string; controller: AbortController } | null>(null)
/** Per language, so starting one cell does not take another's actions away. */
type AiLocaleResult = { rowId: ID; done: AiSingleDone; proposal: boolean }
const aiResults = ref<Record<string, AiLocaleResult>>({})

function setAiResult(code: string, result: AiLocaleResult | null) {
  const { [code]: _dropped, ...rest } = aiResults.value
  aiResults.value = result ? { ...rest, [code]: result } : rest
}

/**
 * A published key is read-only, so what AI writes for it is only proposed until
 * the reviewer accepts; a draft key saves at once and offers Undo.
 */
function canAiTranslate(code: string) {
  if (!aiReady.value || !props.row) return false
  return (
    writable.value ||
    stateOf(code) === 'missing' ||
    stateOf(code) === 'outdated'
  )
}

/** Whether the cell ended with a result, so a run over several can tell when to stop. */
async function onAiTranslate(
  code: string,
  controller = new AbortController(),
): Promise<boolean> {
  const row = props.row
  if (!row || (aiRun.value && aiRun.value.controller !== controller)) return false
  const proposal = !writable.value
  aiRun.value = { code, controller }
  setAiResult(code, null)
  texts.value = { ...texts.value, [code]: '' }
  try {
    const done = await streamAiTranslateOne(
      props.projectId,
      { keyId: Number(row.id), locale: code, save: !proposal },
      {
        signal: controller.signal,
        onToken: (piece) => {
          texts.value = { ...texts.value, [code]: (texts.value[code] ?? '') + piece }
        },
      },
    )
    texts.value = { ...texts.value, [code]: done.text }
    setAiResult(code, { rowId: row.id, done, proposal })
    // Saved server-side when it passed, so the row is read back rather than patched.
    if (done.batchId) emit('ai-changed')
    else if (!proposal)
      toast.add({
        title: 'The result broke a rule and was not saved',
        description: done.issues?.map((issue) => issue.message).join(' · '),
        color: 'warning',
        icon: 'i-lucide:triangle-alert',
      })
    return true
  } catch (error) {
    texts.value = { ...texts.value, [code]: draftOf(code) }
    if ((error as Error).name !== 'AbortError') {
      toast.add({
        title: 'AI translation failed',
        description: (error as Error).message,
        color: 'error',
        icon: 'i-lucide:circle-alert',
      })
    }
    return false
  } finally {
    aiRun.value = null
  }
}

const missingCodes = computed(() =>
  otherLocales.value.filter((code) => stateOf(code) === 'missing'),
)

/**
 * Every empty language of this key, one after another. The list is taken up
 * front: a saved cell stops being Missing, and must not shift the run.
 */
const aiBatch = ref<AbortController | null>(null)
const aiQueued = ref<string[]>([])

async function onAiTranslateMissing() {
  if (aiRun.value || aiBatch.value) return
  const controller = new AbortController()
  aiBatch.value = controller
  const rowId = props.row?.id
  aiQueued.value = [...missingCodes.value]
  try {
    while (aiQueued.value.length) {
      if (controller.signal.aborted || String(props.row?.id) !== String(rowId)) break
      const code = aiQueued.value[0]!
      // A failure (the daily limit, a network error) ends the run; the rest stay empty.
      const ok = await onAiTranslate(code, controller)
      aiQueued.value = aiQueued.value.filter((c) => c !== code)
      if (!ok) break
    }
  } finally {
    aiBatch.value = null
    aiQueued.value = []
  }
}

/** Unaccepted proposals that passed the gate, in the order they are shown. */
const acceptableCodes = computed(() =>
  Object.keys(aiResults.value).filter((code) => {
    const result = rowAiResult(code)[0]
    return result?.proposal && result.done.status !== 'fail'
  }),
)
const proposalCodes = computed(() =>
  Object.keys(aiResults.value).filter((code) => rowAiResult(code)[0]?.proposal),
)

async function onAiAcceptAll() {
  for (const code of [...acceptableCodes.value]) await onAiAccept(code)
}

function onAiDiscardAll() {
  for (const code of [...proposalCodes.value]) onAiDiscard(code)
}

async function onAiAccept(code: string) {
  const result = aiResults.value[code]
  if (!result?.proposal) return
  const accepted = await useApi<{ batchId: string }>(
    `/api/projects/${props.projectId}/ai/translate/accept`,
    {
      method: 'POST',
      body: {
        keyId: Number(result.rowId),
        locale: code,
        text: texts.value[code] ?? '',
      },
    },
  )
  setAiResult(code, {
    ...result,
    proposal: false,
    done: { ...result.done, batchId: accepted.batchId },
  })
  emit('ai-changed')
}

function onAiDiscard(code: string) {
  texts.value = { ...texts.value, [code]: draftOf(code) }
  setAiResult(code, null)
}

async function onAiUndo(code: string) {
  const batchId = aiResults.value[code]?.done.batchId
  if (!batchId) return
  await useApi(
    `/api/projects/${props.projectId}/ai/translate/batches/${batchId}/revert`,
    { method: 'POST' },
  )
  setAiResult(code, null)
  emit('ai-changed')
}

function rowAiResult(code: string) {
  const result = aiResults.value[code]
  return result && String(result.rowId) === String(props.row?.id)
    ? [result]
    : []
}

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
  () => (props.row ? isUnnamedKey(props.row.key) : false),
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

/** Held with its row, like the name suggestion, so a late answer cannot land on another key. */
const ocrReading = ref<{ rowId: ID; text: string } | null>(null)
const rowOcrText = computed(() =>
  ocrReading.value && String(ocrReading.value.rowId) === String(props.row?.id)
    ? ocrReading.value.text
    : null,
)
/** The fingerprint ignores whitespace, so a glued reading is told apart from a real change. */
const ocrMatch = computed(() => {
  const text = rowOcrText.value
  if (text === null) return null
  const source = texts.value[props.sourceLocale] ?? ''
  if (text === source) return 'same' as const
  return fpTranslation(text) === fpTranslation(source)
    ? ('whitespace' as const)
    : ('different' as const)
})

function onOcr(result: { keyId: ID; text: string }) {
  ocrReading.value = { rowId: result.keyId, text: result.text }
}

/** Saved right away: nothing else would commit it, as no field loses focus. */
async function applyOcr() {
  const text = rowOcrText.value
  if (text === null) return
  texts.value = { ...texts.value, [props.sourceLocale]: text }
  ocrReading.value = null
  await saveLocale(props.sourceLocale)
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
  for (const code of props.localeCodes) {
    // An unaccepted proposal is not on the row yet, and a running cell is mid-stream.
    next[code] =
      aiResults.value[code]?.proposal || aiRun.value?.code === code
        ? (texts.value[code] ?? '')
        : draftOf(code)
  }
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
      ocrReading.value = null
      aiResults.value = {}
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
          :ocr-writable="writable"
          @ocr="onOcr"
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
          <div
            v-if="rowOcrText !== null && writable"
            class="flex flex-col gap-2 rounded-md border border-default bg-muted px-3 py-2"
          >
            <div class="flex items-center gap-1.5 text-xs">
              <UIcon name="i-lucide:scan-text" class="size-3.5 text-muted" />
              <span class="font-semibold uppercase tracking-wider text-muted">
                From screenshot
              </span>
              <span
                class="ml-auto"
                :class="ocrMatch === 'different' ? 'text-warning' : 'text-muted'"
              >
                {{
                  ocrMatch === 'same'
                    ? 'Matches the source'
                    : ocrMatch === 'whitespace'
                      ? 'Differs only in spacing'
                      : 'Differs from the source'
                }}
              </span>
            </div>
            <p class="whitespace-pre-wrap break-words text-sm">
              {{ rowOcrText }}
            </p>
            <div class="flex items-center justify-end gap-1">
              <UButton
                size="xs"
                color="neutral"
                variant="ghost"
                label="Dismiss"
                @click="ocrReading = null"
              />
              <UTooltip text="Replace the source text with this reading">
                <span>
                  <UButton
                    size="xs"
                    color="primary"
                    variant="soft"
                    label="Apply to source"
                    :disabled="ocrMatch === 'same'"
                    @click="applyOcr"
                  />
                </span>
              </UTooltip>
            </div>
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
            <template v-if="aiReady">
              <template v-if="proposalCodes.length > 1 && !aiBatch">
                <UButton
                  v-if="acceptableCodes.length > 1"
                  size="xs"
                  color="primary"
                  variant="soft"
                  :label="`Accept ${acceptableCodes.length}`"
                  @click="onAiAcceptAll"
                />
                <UButton
                  size="xs"
                  color="neutral"
                  variant="ghost"
                  label="Discard all"
                  @click="onAiDiscardAll"
                />
              </template>
              <UTooltip
                v-if="aiBatch"
                text="Stop"
              >
                <UButton
                  size="xs"
                  color="neutral"
                  variant="soft"
                  icon="i-lucide:square"
                  aria-label="Stop"
                  @click="aiBatch.abort()"
                />
              </UTooltip>
              <UTooltip
                v-else-if="missingCodes.length"
                :text="`Translate ${missingCodes.length} missing with AI`"
              >
                <UButton
                  size="xs"
                  color="neutral"
                  variant="soft"
                  icon="i-lucide:wand-sparkles"
                  aria-label="Translate missing languages with AI"
                  :disabled="Boolean(aiRun)"
                  @click="onAiTranslateMissing"
                />
              </UTooltip>
            </template>
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
                <UTooltip
                  v-if="canAiTranslate(code)"
                  :text="
                    aiRun?.code !== code && aiQueued.includes(code)
                      ? 'Queued'
                      : stateOf(code) === 'outdated'
                        ? 'Re-translate with AI'
                        : 'Translate with AI'
                  "
                >
                  <UButton
                    v-if="aiRun?.code !== code && aiQueued.includes(code)"
                    size="xs"
                    color="neutral"
                    variant="ghost"
                    icon="i-lucide:clock"
                    aria-label="Queued"
                    disabled
                  />
                  <UButton
                    v-else-if="aiRun?.code !== code"
                    size="xs"
                    color="neutral"
                    variant="ghost"
                    icon="i-lucide:wand-sparkles"
                    aria-label="Translate with AI"
                    :disabled="Boolean(aiRun)"
                    @click="onAiTranslate(code)"
                  />
                  <UButton
                    v-else
                    size="xs"
                    color="neutral"
                    variant="ghost"
                    icon="i-lucide:square"
                    aria-label="Stop"
                    @click="aiRun?.controller.abort()"
                  />
                </UTooltip>
              </div>
              <UTextarea
                v-model="texts[code]"
                class="w-full"
                :ui="{ base: 'resize-y' }"
                :rows="2"
                :maxrows="8"
                autoresize
                :disabled="!writable || aiRun?.code === code"
                :placeholder="writable ? 'Not translated yet' : '—'"
                @blur="saveLocale(code)"
              />
              <p
                v-for="result in rowAiResult(code)"
                :key="result.rowId"
                class="flex items-center gap-1.5 text-xs text-muted"
              >
                <UTooltip
                  :text="result.done.status === 'fail' ? 'Breaks a rule, cannot be accepted' : 'AI generated'"
                >
                  <UIcon
                    name="i-lucide:wand-sparkles"
                    class="size-3.5"
                    :class="result.done.status === 'fail' ? 'text-error' : ''"
                  />
                </UTooltip>
                <span>{{ result.done.model }}</span>
                <div
                  v-if="result.proposal || result.done.batchId"
                  class="ml-auto flex items-center gap-1"
                >
                  <template v-if="result.proposal">
                    <UTooltip
                      v-if="result.done.status !== 'fail'"
                      text="Accept as draft"
                    >
                      <UButton
                        size="xs"
                        color="primary"
                        variant="soft"
                        icon="i-lucide:check"
                        aria-label="Accept as draft"
                        @click="onAiAccept(code)"
                      />
                    </UTooltip>
                    <UTooltip text="Discard">
                      <UButton
                        size="xs"
                        color="neutral"
                        variant="ghost"
                        icon="i-lucide:x"
                        aria-label="Discard"
                        @click="onAiDiscard(code)"
                      />
                    </UTooltip>
                  </template>
                  <UTooltip
                    v-else
                    text="Undo"
                  >
                    <UButton
                      size="xs"
                      color="neutral"
                      variant="ghost"
                      icon="i-lucide:undo-2"
                      aria-label="Undo"
                      @click="onAiUndo(code)"
                    />
                  </UTooltip>
                </div>
              </p>
            </div>
          </div>
        </section>
      </div>
    </div>
    </div>
  </div>
</template>
