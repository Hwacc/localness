<script setup lang="ts">
import { read, utils, type WorkBook } from 'xlsx'
import { formatI18nKeyDisplay } from '#shared/utils'
import { TRANSLATION_LANGUAGES } from '#shared/constants'
import {
  describeLocaleOverlap,
  guessLocale,
  importDuplicateDropped,
  importDuplicateText,
  importWarningText,
  isLosslessDuplicate,
  localeLabelFromFilename,
  parseLocaleJson,
  readXlsxSheet,
  restrictSheetDuplicate,
  type ImportDuplicate,
  type ImportJsonDuplicate,
  type ImportParseWarning,
  type ImportSheetDuplicate,
  type LocaleOverlap,
} from '#shared/utils/i18n-import'
import type {
  I18nImportSkipReason,
  II18nImportPreview,
  II18nImportResult,
} from '#shared/types/I18nKey'
import type { IProjectRelease } from '#shared/types/Project'

/**
 * Import existing locale files into this project. Parsing and locale mapping
 * happen here; the server classifies and writes. The drawer is Project Owner
 * only — the page hides the trigger, the endpoints refuse everyone else.
 *
 * Three steps on one panel: pick files, confirm which project locale each file
 * or column is, then review the server's preview and apply. Any change to the
 * files or the mapping drops the preview, so what gets applied is always what
 * was last reviewed.
 */

const props = defineProps<{
  projectId: ID | undefined
  localeCodes: string[]
  sourceLocale: string
  releases: IProjectRelease[]
}>()

const emit = defineEmits<{ imported: [] }>()

type ImportSource = {
  id: string
  /** File name, or the column header of a sheet. */
  label: string
  entries: Record<string, string>
  /** JSON only. A sheet's warnings and duplicates span its columns and live on the sheet. */
  warnings: ImportParseWarning[]
  duplicates: ImportJsonDuplicate[]
  /** `IGNORE` means the user chose to ignore this source. */
  locale: string
}

type ShownDuplicate = {
  id: string
  /** The file, or the sheet, it was found in. */
  origin: string
  text: string
  dropped: string[]
}

/** Rows rendered for the `new` group; the rest are counted, not listed. */
const NEW_ROWS_SHOWN = 100
const WARNINGS_SHOWN = 20
/** Not `''`: reka-ui reserves the empty string on a combobox item for "no selection". */
const IGNORE = '__ignore__'

const SKIP_REASON_TEXT: Record<I18nImportSkipReason, string> = {
  'no-source-text': 'No text in the source language',
  'reserved-prefix': 'Uses the reserved __draft_ prefix',
  'empty-key': 'Empty key',
}

const toast = useToast()
const open = ref(false)
const fileInput = useTemplateRef<HTMLInputElement>('fileInput')

const sources = ref<ImportSource[]>([])
const parseErrors = ref<string[]>([])
const workbook = shallowRef<WorkBook | null>(null)
const workbookName = ref('')
const sheetName = ref('')
const sheetWarnings = ref<ImportParseWarning[]>([])
const sheetDuplicates = ref<ImportSheetDuplicate[]>([])

const preview = ref<II18nImportPreview | null>(null)
const previewing = ref(false)
const applying = ref(false)
const overwrite = ref<Set<string>>(new Set())
const releaseId = ref<number | undefined>(undefined)

const localeItems = computed(() => [
  { label: 'Ignore', value: IGNORE },
  ...props.localeCodes.map((code) => ({
    label:
      TRANSLATION_LANGUAGES.find((language) => language.value === code)?.label ??
      code,
    value: code,
  })),
])

const releaseItems = computed(() =>
  props.releases.map((release) => ({
    label: release.name,
    value: Number(release.id),
  }))
)

function reset() {
  sources.value = []
  parseErrors.value = []
  workbook.value = null
  workbookName.value = ''
  sheetName.value = ''
  sheetWarnings.value = []
  sheetDuplicates.value = []
  preview.value = null
  overwrite.value = new Set()
  releaseId.value = undefined
  if (fileInput.value) fileInput.value.value = ''
}

function sourceFor(
  label: string,
  parsed: Pick<ImportSource, 'entries' | 'warnings' | 'duplicates'>,
  id: string
): ImportSource {
  return {
    id,
    label,
    ...parsed,
    locale: guessLocale(label, props.localeCodes) ?? IGNORE,
  }
}

function readSheet() {
  const book = workbook.value
  const sheet = book?.Sheets[sheetName.value]
  if (!book || !sheet) return
  const rows = utils.sheet_to_json<unknown[]>(sheet, {
    header: 1,
    defval: null,
    raw: true,
  })
  const result = readXlsxSheet(rows)
  sheetWarnings.value = result.ok ? result.warnings : []
  sheetDuplicates.value = result.ok ? result.duplicates : []
  if (!result.ok) {
    sources.value = []
    parseErrors.value = [
      result.reason === 'empty'
        ? `Sheet “${sheetName.value}” is empty`
        : `Sheet “${sheetName.value}” has no column named “key”`,
    ]
    return
  }
  parseErrors.value = []
  sources.value = result.columns.map((column, index) =>
    sourceFor(
      column.label,
      { entries: column.entries, warnings: [], duplicates: [] },
      `${sheetName.value}:${index}`
    )
  )
}

/**
 * JSON picks add to what is already listed, since the native picker only hands
 * over this pick's files and locales often live in separate folders; a file
 * with the same name replaces its earlier copy. A sheet stands alone — it
 * replaces everything, and a JSON pick replaces a loaded sheet.
 */
async function onFilesPicked(event: Event) {
  const input = event.target as HTMLInputElement
  const picked = [...(input.files ?? [])]
  // Cleared so picking the same file again still fires `change`.
  input.value = ''
  if (!picked.length) return

  const sheets = picked.filter((file) => /\.xlsx$/i.test(file.name))
  const jsons = picked.filter((file) => /\.json$/i.test(file.name))
  if (sheets.length && (jsons.length || sheets.length > 1)) {
    parseErrors.value = ['Pick one .xlsx file, or any number of .json files — not both']
    return
  }

  if (sheets.length) {
    reset()
    const file = sheets[0]!
    try {
      workbook.value = read(await file.arrayBuffer(), { type: 'array' })
    } catch {
      parseErrors.value = [`${file.name} could not be read as a spreadsheet`]
      return
    }
    workbookName.value = file.name
    sheetName.value = workbook.value.SheetNames[0] ?? ''
    readSheet()
    return
  }

  if (workbook.value) reset()
  const errors: string[] = []
  const next: ImportSource[] = []
  for (const file of jsons) {
    try {
      const parsed = parseLocaleJson(await file.text())
      next.push(sourceFor(localeLabelFromFilename(file.name), parsed, file.name))
    } catch (error) {
      errors.push(`${file.name}: ${error instanceof Error ? error.message : 'invalid JSON'}`)
    }
  }
  const unsupported = picked.length - sheets.length - jsons.length
  if (unsupported) errors.push(`${unsupported} file(s) skipped: only .json and .xlsx are supported`)
  const replaced = new Set(next.map((source) => source.id))
  sources.value = [
    ...sources.value.filter((source) => !replaced.has(source.id)),
    ...next,
  ]
  parseErrors.value = errors
}

function removeSource(id: string) {
  sources.value = sources.value.filter((source) => source.id !== id)
}

watch(sheetName, (next, previous) => {
  if (previous && next !== previous) readSheet()
})

// A preview describes one exact payload; any edit to it makes the preview stale.
watch(
  () => sources.value.map((source) => source.locale),
  () => {
    preview.value = null
  }
)

const mappedSources = computed(() =>
  sources.value.filter((source) => source.locale !== IGNORE)
)
const ignoredSources = computed(() =>
  sources.value.filter((source) => source.locale === IGNORE)
)

/** Sources sharing a locale merge in list order; each shared locale gets its account. */
const localeOverlaps = computed<Array<LocaleOverlap & { locale: string }>>(() => {
  const byLocale = new Map<string, ImportSource[]>()
  for (const source of mappedSources.value) {
    byLocale.set(source.locale, [...(byLocale.get(source.locale) ?? []), source])
  }
  return [...byLocale]
    .filter(([, shared]) => shared.length > 1)
    .map(([locale, shared]) => ({
      locale,
      ...describeLocaleOverlap(locale, shared),
    }))
})

const hasSourceLocale = computed(() =>
  mappedSources.value.some((source) => source.locale === props.sourceLocale)
)

const sheetOrigin = computed(() => `${workbookName.value} / ${sheetName.value}`)

const parseWarnings = computed(() => [
  ...sources.value.flatMap((source) =>
    source.warnings.map((warning) => `${source.label}: ${importWarningText(warning)}`)
  ),
  ...sheetWarnings.value.map(
    (warning) => `${sheetOrigin.value}: ${importWarningText(warning)}`
  ),
])

/**
 * Duplicates in what is actually being imported: an ignored file's are moot,
 * and a sheet's only count through the columns mapped to a locale.
 */
const importedDuplicates = computed(() => {
  const found: Array<{ origin: string; duplicate: ImportDuplicate }> = []
  for (const source of mappedSources.value) {
    for (const duplicate of source.duplicates) {
      found.push({ origin: source.label, duplicate })
    }
  }
  const mappedColumns = new Set(
    workbook.value ? mappedSources.value.map((source) => source.label) : []
  )
  if (mappedColumns.size) {
    for (const duplicate of sheetDuplicates.value) {
      found.push({
        origin: sheetOrigin.value,
        duplicate: restrictSheetDuplicate(duplicate, mappedColumns),
      })
    }
  }
  return found
})

const lossyDuplicates = computed<ShownDuplicate[]>(() =>
  importedDuplicates.value
    .filter(({ duplicate }) => !isLosslessDuplicate(duplicate))
    .map(({ origin, duplicate }) => ({
      id: `${origin}\0${duplicate.key}`,
      origin,
      text: importDuplicateText(duplicate),
      dropped: importDuplicateDropped(duplicate),
    }))
)

const losslessDuplicateCount = computed(
  () =>
    importedDuplicates.value.filter(({ duplicate }) =>
      isLosslessDuplicate(duplicate)
    ).length
)

function buildPayload(): Record<string, Record<string, string>> {
  const payload: Record<string, Record<string, string>> = {}
  for (const source of mappedSources.value) {
    payload[source.locale] = { ...(payload[source.locale] ?? {}), ...source.entries }
  }
  return payload
}

async function runPreview() {
  if (!validID(props.projectId) || !mappedSources.value.length) return
  previewing.value = true
  try {
    const result = await useApi<II18nImportPreview>(
      `/api/projects/${props.projectId}/import/preview`,
      { method: 'POST', body: { locales: buildPayload() } }
    )
    preview.value = result
    overwrite.value = new Set()
  } finally {
    previewing.value = false
  }
}

const newRows = computed(
  () => preview.value?.rows.filter((row) => row.kind === 'new') ?? []
)
const changedRows = computed(
  () => preview.value?.rows.filter((row) => row.kind === 'changed') ?? []
)
const violatingCount = computed(
  () => preview.value?.rows.filter((row) => row.violations.length).length ?? 0
)
const mixedPlaceholders = computed(
  () => (preview.value?.interpolationStyles.length ?? 0) > 1
)

function toggleOverwrite(key: string, checked: boolean) {
  const next = new Set(overwrite.value)
  if (checked) next.add(key)
  else next.delete(key)
  overwrite.value = next
}

const allChangedSelected = computed(
  () =>
    changedRows.value.length > 0 &&
    changedRows.value.every((row) => overwrite.value.has(row.key))
)

function toggleAllChanged(checked: boolean) {
  overwrite.value = checked
    ? new Set(changedRows.value.map((row) => row.key))
    : new Set()
}

const writeCount = computed(() => newRows.value.length + overwrite.value.size)

async function runApply() {
  if (!validID(props.projectId) || !preview.value) return
  applying.value = true
  try {
    const result = await useApi<II18nImportResult>(
      `/api/projects/${props.projectId}/import/apply`,
      {
        method: 'POST',
        body: {
          locales: buildPayload(),
          overwriteKeys: [...overwrite.value],
          releaseId: releaseId.value,
        },
      }
    )
    const parts = [`${result.created} created`, `${result.updated} updated`]
    if (result.unchanged) parts.push(`${result.unchanged} unchanged`)
    if (result.skipped) parts.push(`${result.skipped} skipped`)
    if (result.releaseLinked) parts.push(`${result.releaseLinked} added to release`)
    toast.add({
      title: 'Imported',
      description: parts.join(', '),
      color: 'success',
      icon: 'i-lucide:check',
    })
    emit('imported')
    open.value = false
  } finally {
    applying.value = false
  }
}

watch(open, (isOpen) => {
  if (!isOpen) reset()
})
</script>

<template>
  <USlideover
    v-model:open="open"
    title="Import translations"
    description="Existing locale files land published and stay out of Git sync."
    side="right"
    :close="{ icon: 'i-lucide:x' }"
    :ui="{ content: 'max-w-2xl', body: 'p-4 sm:p-4' }"
  >
    <UButton
      size="sm"
      color="neutral"
      variant="outline"
      label="Import"
      icon="i-lucide:upload"
      :disabled="!validID(projectId)"
    />

    <template #body>
      <div class="flex flex-col gap-6">
        <section class="flex flex-col gap-2">
          <p class="text-sm font-medium">1. Files</p>
          <p class="text-xs text-muted">
            One .json per locale (nested keys become <code>a.b.c</code>) — pick
            again to add more — or one .xlsx with a <code>key</code> column and
            a column per locale.
          </p>
          <input
            ref="fileInput"
            type="file"
            accept=".json,.xlsx"
            multiple
            class="text-sm file:mr-3 file:rounded-md file:border file:border-default file:bg-elevated file:px-3 file:py-1.5 file:text-sm file:text-default"
            @change="onFilesPicked"
          >
          <div v-if="workbook && workbook.SheetNames.length > 1" class="flex items-center gap-2">
            <span class="text-xs text-muted">Sheet in {{ workbookName }}</span>
            <USelectMenu
              v-model="sheetName"
              class="w-48"
              size="sm"
              :items="workbook.SheetNames"
              :search-input="false"
            />
          </div>
          <UAlert
            v-for="error in parseErrors"
            :key="error"
            color="error"
            variant="subtle"
            icon="i-lucide:circle-x"
            :description="error"
          />
        </section>

        <section v-if="sources.length" class="flex flex-col gap-2">
          <p class="text-sm font-medium">2. Locales</p>
          <div
            v-for="source in sources"
            :key="source.id"
            class="flex items-center justify-between gap-3 rounded-lg border border-default px-3 py-2"
          >
            <div class="min-w-0">
              <p class="truncate text-sm">{{ source.label }}</p>
              <p class="text-xs text-muted">
                {{ Object.keys(source.entries).length }} key(s)
              </p>
            </div>
            <div class="flex items-center gap-1">
              <USelectMenu
                v-model="source.locale"
                class="w-52"
                size="sm"
                :items="localeItems"
                value-key="value"
              />
              <UButton
                v-if="!workbook"
                size="xs"
                color="neutral"
                variant="ghost"
                icon="i-lucide:x"
                square
                aria-label="Remove file"
                @click="removeSource(source.id)"
              />
            </div>
          </div>
          <p v-if="ignoredSources.length" class="text-xs text-muted">
            Ignored: {{ ignoredSources.map((source) => source.label).join(', ') }}
          </p>
          <UAlert
            v-for="overlap in localeOverlaps"
            :key="overlap.locale"
            :color="overlap.level === 'warning' ? 'warning' : 'neutral'"
            variant="subtle"
            :icon="overlap.level === 'warning' ? 'i-lucide:triangle-alert' : 'i-lucide:info'"
            :description="overlap.text"
          />
          <UAlert
            v-if="mappedSources.length && !hasSourceLocale"
            color="warning"
            variant="subtle"
            icon="i-lucide:triangle-alert"
            :description="`Nothing maps to the source language (${sourceLocale}). Only keys the project already has can be updated; new ones are skipped.`"
          />
          <details v-if="parseWarnings.length" class="text-xs text-muted">
            <summary class="cursor-pointer">
              {{ parseWarnings.length }} parse warning(s)
            </summary>
            <ul class="mt-1 list-disc pl-5">
              <li v-for="warning in parseWarnings.slice(0, WARNINGS_SHOWN)" :key="warning">
                {{ warning }}
              </li>
              <li v-if="parseWarnings.length > WARNINGS_SHOWN">
                +{{ parseWarnings.length - WARNINGS_SHOWN }} more
              </li>
            </ul>
          </details>
          <UButton
            class="self-end"
            size="sm"
            icon="i-lucide:scan-search"
            label="Preview"
            :loading="previewing"
            :disabled="!mappedSources.length"
            @click="runPreview"
          />
        </section>

        <section v-if="preview" class="flex flex-col gap-3">
          <p class="text-sm font-medium">3. Review</p>
          <div class="flex flex-wrap gap-2">
            <UBadge color="success" variant="subtle">{{ preview.counts.new }} new</UBadge>
            <UBadge color="warning" variant="subtle">{{ preview.counts.changed }} changed</UBadge>
            <UBadge color="neutral" variant="subtle">{{ preview.counts.same }} unchanged</UBadge>
            <UBadge color="error" variant="subtle">{{ preview.counts.skipped }} skipped</UBadge>
          </div>

          <UAlert
            v-if="mixedPlaceholders"
            color="warning"
            variant="subtle"
            icon="i-lucide:braces"
            description="The files mix {name} and {{name}} placeholders. One i18n runtime will show the other's placeholders as literal text."
          />
          <UAlert
            v-if="violatingCount"
            color="neutral"
            variant="subtle"
            icon="i-lucide:info"
            :description="`${violatingCount} key(s) do not follow this project's naming convention. They are imported as they are — the names are already used in code.`"
          />
          <p v-if="preview.ignoredLocales.length" class="text-xs text-muted">
            Locales not configured in this project were ignored:
            {{ preview.ignoredLocales.join(', ') }}
          </p>

          <details v-if="lossyDuplicates.length" class="text-xs" open>
            <summary class="cursor-pointer text-warning">
              Duplicates in the files ({{ lossyDuplicates.length }})
            </summary>
            <p class="mt-1 text-muted">
              Where a key is defined more than once, only the kept value is imported.
            </p>
            <ul class="mt-2 flex flex-col gap-2">
              <li
                v-for="item in lossyDuplicates"
                :key="item.id"
                class="rounded-md border border-default px-2 py-1.5"
              >
                <p class="text-muted">{{ item.origin }}</p>
                <p class="break-words">{{ item.text }}</p>
                <p v-if="item.dropped.length" class="text-muted break-words">
                  Dropped:
                  <template v-for="(value, index) in item.dropped" :key="value">
                    <span class="line-through">{{ value }}</span><span v-if="index < item.dropped.length - 1">, </span>
                  </template>
                </p>
              </li>
            </ul>
          </details>
          <p v-if="losslessDuplicateCount" class="text-xs text-muted">
            {{ losslessDuplicateCount }} key(s) are defined more than once with
            identical text. Nothing is lost.
          </p>

          <details v-if="preview.skipped.length" class="text-xs">
            <summary class="cursor-pointer text-muted">
              {{ preview.skipped.length }} skipped
            </summary>
            <ul class="mt-1 flex flex-col gap-0.5 pl-2">
              <li v-for="row in preview.skipped" :key="`${row.reason}:${row.key}`">
                <code>{{ formatI18nKeyDisplay(row.key) || '(empty)' }}</code>
                <span class="text-muted"> — {{ SKIP_REASON_TEXT[row.reason] }}</span>
              </li>
            </ul>
          </details>

          <div v-if="changedRows.length" class="flex flex-col gap-2">
            <div class="flex items-center justify-between">
              <p class="text-sm">Changed — tick the ones to overwrite</p>
              <UCheckbox
                :model-value="allChangedSelected"
                label="Select all"
                @update:model-value="(value) => toggleAllChanged(value === true)"
              />
            </div>
            <div
              v-for="row in changedRows"
              :key="row.key"
              class="rounded-lg border border-default px-3 py-2 flex gap-3"
            >
              <UCheckbox
                :model-value="overwrite.has(row.key)"
                @update:model-value="(value) => toggleOverwrite(row.key, value === true)"
              />
              <div class="min-w-0 flex-1 flex flex-col gap-1">
                <div class="flex items-center gap-2">
                  <code class="truncate text-sm">{{ formatI18nKeyDisplay(row.key) }}</code>
                  <UBadge
                    v-if="row.hasUnpublishedDraft"
                    size="sm"
                    color="warning"
                    variant="subtle"
                  >
                    Unpublished draft will be replaced
                  </UBadge>
                </div>
                <div
                  v-for="change in row.changes"
                  :key="change.locale"
                  class="grid grid-cols-[4rem_1fr] gap-2 text-xs"
                >
                  <span class="text-muted">{{ change.locale }}</span>
                  <div class="min-w-0">
                    <p class="text-muted line-through whitespace-pre-wrap break-words">
                      {{ change.before ?? '(none)' }}
                    </p>
                    <p class="whitespace-pre-wrap break-words">{{ change.after }}</p>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <details v-if="newRows.length" class="text-xs">
            <summary class="cursor-pointer text-muted">
              {{ newRows.length }} new key(s)
            </summary>
            <ul class="mt-1 flex flex-col gap-0.5 pl-2">
              <li v-for="row in newRows.slice(0, NEW_ROWS_SHOWN)" :key="row.key" class="truncate">
                <code>{{ formatI18nKeyDisplay(row.key) }}</code>
                <span class="text-muted"> — {{ row.texts[preview.sourceLocale] ?? '' }}</span>
              </li>
              <li v-if="newRows.length > NEW_ROWS_SHOWN" class="text-muted">
                +{{ newRows.length - NEW_ROWS_SHOWN }} more
              </li>
            </ul>
          </details>

          <div v-if="releaseItems.length" class="flex flex-col gap-1">
            <p class="text-sm">Release label (optional)</p>
            <div class="flex items-center gap-2">
              <USelectMenu
                v-model="releaseId"
                class="w-64"
                size="sm"
                :items="releaseItems"
                value-key="value"
                placeholder="No release"
              />
              <UButton
                v-if="releaseId !== undefined"
                size="xs"
                color="neutral"
                variant="ghost"
                label="Clear"
                @click="releaseId = undefined"
              />
            </div>
            <p class="text-xs text-muted">
              Applies to every key in the files, unchanged ones included.
            </p>
          </div>
        </section>
      </div>
    </template>

    <template #footer>
      <div class="w-full flex items-center justify-end gap-3">
        <UButton color="neutral" variant="ghost" label="Cancel" @click="open = false" />
        <UButton
          icon="i-lucide:upload"
          :label="`Import ${writeCount} key(s)`"
          :loading="applying"
          :disabled="!preview || (!writeCount && !releaseId)"
          @click="runApply"
        />
      </div>
    </template>
  </USlideover>
</template>
