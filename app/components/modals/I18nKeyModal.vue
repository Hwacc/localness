<script setup lang="ts">
import {
  DEFAULT_LOCALE_FALLBACK,
  DEFAULT_LOCALES,
  TRANSLATION_LANGUAGES,
} from '#shared/constants'
import { formatI18nKeyDisplay, resolveEditedKey } from '#shared/utils'

const props = defineProps<{
  row?: II18nKeyRow | null
  locales: string[]
  projectId: ID
  readonly?: boolean
}>()

const emit = defineEmits<{
  close: [boolean]
  saved: []
}>()

const toast = useToast()
const loading = ref(false)
const isCreate = computed(() => !props.row)

const projectStore = useProjectStore()

const state = reactive({
  key: '',
  origin: '',
  locales: {} as Record<string, string>,
  releaseIds: [] as number[],
})

/*
 * `generating`, not `loading`: this dialog already has a `loading` for Save, and
 * the two mean different things — one is "the request is still running", the
 * other is "the write is in flight".
 */
const { loading: generating, suggestion, generate } = useI18nKeyGeneration()

/** Naming needs the text, exactly as the tag dialog does: nothing to name without it. */
function onGenerate() {
  if (!state.origin.trim()) return
  generate({ projectId: props.projectId, origin: state.origin })
}

/** The panel is only a suggestion until it is taken or waved away. */
function dismissSuggestion() {
  suggestion.value = null
}

/**
 * Git sync is a setting, not content, so it is neither part of `state` nor sent
 * with Save — the endpoint that writes it does not require a draft, which is
 * what lets a published key be switched off. That also means it is live on
 * toggle rather than on Save.
 */
const syncEnabled = ref(true)
const syncSaving = ref(false)

const localeCodes = computed(() =>
  props.locales.length ? props.locales : [...DEFAULT_LOCALES]
)

const tabsItems = [
  { label: 'General', icon: 'i-lucide:info', slot: 'general' },
  { label: 'Translations', icon: 'i-lucide:languages', slot: 'translations' },
]

function fillFromRow(row: II18nKeyRow | null | undefined) {
  state.key = row?.key ?? ''
  state.origin = row?.origin ?? ''
  const next: Record<string, string> = {}
  for (const code of localeCodes.value) {
    next[code] =
      row?.locales.find((locale) => locale.locale === code)?.draftText ?? ''
  }
  state.locales = next
  syncEnabled.value = row?.gitSyncEnabled ?? true
  // A new entry created while one release is being viewed starts on that one.
  const defaultReleaseId = defaultReleaseIdForFilter(
    projectStore.curReleaseFilter
  )
  state.releaseIds = row
    ? (row.releaseIds ?? []).map(Number)
    : defaultReleaseId
      ? [defaultReleaseId]
      : []
}

fillFromRow(props.row)

watch(
  () => props.row?.id,
  () => fillFromRow(props.row)
)

function localeMeta(code: string) {
  return TRANSLATION_LANGUAGES.find((lang) => lang.value === code)
}

const localeItems = computed(() =>
  localeCodes.value.map((code) => ({
    label: localeMeta(code)?.label || code,
    value: code,
  }))
)

/**
 * English starts open, being the fallback locale the API serves first; a project
 * that does not carry it opens on whichever locale leads its own list. Held here
 * rather than left to the accordion's own default: `UTabs` unmounts the tab it is
 * not showing, so a default would be reapplied on every return to this one.
 */
const openLocale = ref<string | undefined>(
  localeCodes.value.includes(DEFAULT_LOCALE_FALLBACK)
    ? DEFAULT_LOCALE_FALLBACK
    : localeCodes.value[0]
)

const keyDisplay = computed({
  get: () => formatI18nKeyDisplay(state.key),
  set: (value: string) => {
    // Same rule the table's inline rename uses, so neither can write a
    // shortened `__draft_…` display form back as the key.
    const next = resolveEditedKey(state.key, value)
    if (next === null) return
    state.key = next
  },
})

/** Taking a suggestion ends the panel's job, the same way waving it away does. */
function onPickSuggestion(key: string) {
  keyDisplay.value = key
  dismissSuggestion()
}

async function onSyncToggle(enabled: boolean) {
  const row = props.row
  if (!row || syncSaving.value) return
  const previous = syncEnabled.value
  syncSaving.value = true
  syncEnabled.value = enabled
  try {
    await useApi(
      `/api/projects/${props.projectId}/i18n-keys/${row.id}/git-sync`,
      { method: 'POST', body: { enabled } }
    )
    toast.add({
      title: enabled ? 'Included in Git sync' : 'Kept out of Git sync',
      color: 'success',
      icon: 'i-lucide:check',
    })
    emit('saved')
  } catch (error) {
    // `useApi` has already reported it — put the switch back where it was.
    console.error(error)
    syncEnabled.value = previous
  } finally {
    syncSaving.value = false
  }
}

async function onSave() {
  if (props.readonly) return
  const key = state.key.trim()
  const origin = state.origin.trim()
  if (!key) {
    toast.add({
      title: 'Key is required',
      color: 'error',
      icon: 'i-lucide:circle-alert',
    })
    return
  }
  if (!origin) {
    toast.add({
      title: 'Origin is required',
      color: 'error',
      icon: 'i-lucide:circle-alert',
    })
    return
  }
  loading.value = true
  try {
    if (isCreate.value) {
      await useApi('/api/translation', {
        method: 'POST',
        body: {
          projectId: Number(props.projectId),
          key,
          origin,
          vue: state.locales,
          releaseIds: state.releaseIds,
        },
      })
    } else {
      const row = props.row!
      if (key !== row.key) {
        await useApi(
          `/api/projects/${props.projectId}/i18n-keys/${row.id}`,
          {
            method: 'PATCH',
            body: { key },
          }
        )
      }
      await useApi(`/api/translation/${row.id}`, {
        method: 'POST',
        body: {
          origin,
          vue: state.locales,
          // Always sent, so clearing every label saves as "Unassigned" rather
          // than being read as "leave them alone".
          releaseIds: state.releaseIds,
        },
      })
    }
    toast.add({
      title: isCreate.value ? 'Created' : 'Saved',
      color: 'success',
      icon: 'i-lucide:check',
    })
    emit('saved')
    emit('close', true)
  } catch (error) {
    console.error(error)
  } finally {
    loading.value = false
  }
}
</script>

<template>
  <UModal
    :title="
      readonly
        ? 'View translation'
        : isCreate
          ? 'New translation'
          : 'Edit translation'
    "
    :ui="{ content: 'max-w-lg' }"
    @update:open="(open: boolean) => !open && emit('close', false)"
  >
    <template #body>
      <!--
        Split rather than one long column: drafts are usually edited inline in
        the table, so this dialog is mostly opened for the identity fields —
        the locale texts are the occasional errand. General therefore leads.
      -->
      <UTabs :items="tabsItems" variant="link" :ui="{ trigger: 'grow' }">
        <template #general>
          <div class="flex flex-col gap-4">
            <UFormField label="Key">
              <div class="w-full flex flex-col gap-2">
                <div class="w-full flex items-center gap-2.5">
                  <UInput
                    v-model="keyDisplay"
                    class="w-full font-mono"
                    :disabled="readonly"
                  />
                  <AIButton
                    v-if="!readonly"
                    :loading="generating"
                    @click="onGenerate"
                  />
                </div>
                <AIKeySuggestion
                  v-if="suggestion"
                  :suggestion="suggestion"
                  :origin="state.origin"
                  @pick="onPickSuggestion"
                  @cancel="dismissSuggestion"
                />
              </div>
            </UFormField>
            <UFormField label="Origin">
              <UTextarea
                v-model="state.origin"
                class="w-full"
                :rows="3"
                :disabled="readonly"
              />
            </UFormField>
            <UFormField label="Releases">
              <ReleaseSelect
                v-model="state.releaseIds"
                :disabled="readonly"
              />
            </UFormField>
            <!--
              Live on toggle, and not disabled by `readonly`: this is a sync
              setting, so it stays available on the published keys that are
              otherwise read-only here.
            -->
            <UFormField
              v-if="props.row"
              label="Git sync"
              description="Off keeps this key out of pull and push. It is still served on the published API."
            >
              <USwitch
                :model-value="syncEnabled"
                :loading="syncSaving"
                @update:model-value="onSyncToggle"
              />
            </UFormField>
          </div>
        </template>
        <template #translations>
          <UAccordion v-model="openLocale" :items="localeItems">
            <template #body="{ item }">
              <!--
                Nuxt UI's own theme pairs `autoresize` with `resize-none`, so the
                drag handle has to be taken back explicitly: auto-grow covers the
                usual case, and the handle covers text longer than `maxrows`.
              -->
              <UTextarea
                v-model="state.locales[item.value]"
                class="w-full"
                :ui="{ base: 'resize-y' }"
                :rows="3"
                :maxrows="10"
                autoresize
                :disabled="readonly"
              />
            </template>
          </UAccordion>
        </template>
      </UTabs>
    </template>
    <template #footer>
      <div class="w-full flex items-center justify-end gap-2">
        <UButton
          color="neutral"
          variant="ghost"
          :label="readonly ? 'Close' : 'Cancel'"
          :disabled="loading"
          @click="emit('close', false)"
        />
        <UButton
          v-if="!readonly"
          :label="isCreate ? 'Create' : 'Save'"
          :loading="loading"
          @click="onSave"
        />
      </div>
    </template>
  </UModal>
</template>
