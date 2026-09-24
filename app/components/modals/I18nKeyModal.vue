<script setup lang="ts">
import {
  DEFAULT_LOCALE_FALLBACK,
  DEFAULT_LOCALES,
  TRANSLATION_LANGUAGES,
} from '#shared/constants'
import { formatI18nKeyDisplay, resolveEditedKey } from '#shared/utils'

/**
 * New key only: the view/edit half of this dialog moved to `I18nKeySlideover`,
 * which shows one key's locales at a width they can actually be read at.
 */
const props = defineProps<{
  locales: string[]
  projectId: ID
}>()

const emit = defineEmits<{
  close: [boolean]
  saved: []
}>()

const toast = useToast()
const loading = ref(false)

const projectStore = useProjectStore()

const state = reactive({
  key: '',
  locales: {} as Record<string, string>,
  releaseIds: [] as number[],
})

/*
 * `generating`, not `loading`: this dialog already has a `loading` for Create,
 * and the two mean different things — one is "the request is still running",
 * the other is "the write is in flight".
 */
const { loading: generating, suggestion, generate } = useI18nKeyGeneration()

/** Naming needs the text, exactly as the tag dialog does: nothing to name without it. */
function onGenerate() {
  const sourceText = (state.locales[sourceLocale.value] ?? '').trim()
  if (!sourceText) return
  generate({ projectId: props.projectId, sourceText })
}

/** The panel is only a suggestion until it is taken or waved away. */
function dismissSuggestion() {
  suggestion.value = null
}

const localeCodes = computed(() =>
  props.locales.length ? props.locales : [...DEFAULT_LOCALES]
)

const tabsItems = [
  { label: 'General', icon: 'i-lucide:info', slot: 'general' },
  { label: 'Translations', icon: 'i-lucide:languages', slot: 'translations' },
]

function localeMeta(code: string) {
  return TRANSLATION_LANGUAGES.find((lang) => lang.value === code)
}

/** Where this project's original text lives — the entry a translator reaches for first. */
const sourceLocale = computed(
  () =>
    projectStore.curProject?.settings?.localeFallback ||
    DEFAULT_LOCALE_FALLBACK
)
const sourceItem = computed(() => localeMeta(sourceLocale.value))

/** The source language is edited on the General tab, so it is not an entry here. */
const otherLocaleCodes = computed(() =>
  localeCodes.value.filter((code) => code !== sourceLocale.value)
)

const localeItems = computed(() =>
  otherLocaleCodes.value.map((code) => ({
    label: localeMeta(code)?.label || code,
    value: code,
  }))
)

/** Held in a ref: `UTabs` reapplies its own default whenever this tab is re-entered. */
const openLocale = ref<string | undefined>(otherLocaleCodes.value[0])

/** A new entry starts on the release being viewed, so tagging the obvious one is one click. */
function defaultReleaseIds() {
  const releaseId = defaultReleaseIdForFilter(projectStore.curReleaseFilter)
  return releaseId ? [releaseId] : []
}

state.locales = Object.fromEntries(
  localeCodes.value.map((code) => [code, ''])
)
state.releaseIds = defaultReleaseIds()

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

/** Staged rather than live: there is nothing to write to until this is created. */
async function onSave() {
  const key = state.key.trim()
  const sourceText = (state.locales[sourceLocale.value] ?? '').trim()
  if (!key) {
    toast.add({
      title: 'Key is required',
      color: 'error',
      icon: 'i-lucide:circle-alert',
    })
    return
  }
  if (!sourceText) {
    toast.add({
      title: 'Source text is required',
      color: 'error',
      icon: 'i-lucide:circle-alert',
    })
    return
  }
  loading.value = true
  try {
    await useApi('/api/translation', {
      method: 'POST',
      body: {
        projectId: Number(props.projectId),
        key,
        vue: state.locales,
        releaseIds: state.releaseIds,
      },
    })
    toast.add({
      title: 'Created',
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
    title="New translation"
    :ui="{ content: 'max-w-lg' }"
    @update:open="(open: boolean) => !open && emit('close', false)"
  >
    <template #body>
      <!--
        General leads because it holds what this needs to create anything — the
        key and the source text. The other languages are optional and follow.
      -->
      <UTabs :items="tabsItems" variant="link" :ui="{ trigger: 'grow' }">
        <template #general>
          <div class="flex flex-col gap-4">
            <UFormField label="Key">
              <div class="w-full flex flex-col gap-2">
                <div class="w-full flex items-center gap-2.5">
                  <UInput v-model="keyDisplay" class="w-full font-mono" />
                  <AIButton :loading="generating" @click="onGenerate" />
                </div>
                <AIKeySuggestion
                  v-if="suggestion"
                  :suggestion="suggestion"
                  :source-text="state.locales[sourceLocale] ?? ''"
                  @pick="onPickSuggestion"
                  @cancel="dismissSuggestion"
                />
              </div>
            </UFormField>
            <UFormField :label="sourceItem?.label || 'Source'">
              <template #label="{ label }">
                <div class="flex items-center gap-2">
                  <UIcon
                    :name="sourceItem?.icon || 'i-lucide:languages'"
                    size="14"
                  />
                  <span>{{ label }}</span>
                </div>
              </template>
              <UTextarea v-model="state.locales[sourceLocale]" class="w-full" :rows="3" />
            </UFormField>
            <UFormField label="Releases">
              <ReleaseSelect v-model="state.releaseIds" />
            </UFormField>
          </div>
        </template>
        <template #translations>
          <p v-if="sourceItem" class="mb-3 text-xs text-muted">
            {{ sourceItem.label }} is the source language; edit it on the
            General tab.
          </p>
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
          label="Cancel"
          :disabled="loading"
          @click="emit('close', false)"
        />
        <UButton label="Create" :loading="loading" @click="onSave" />
      </div>
    </template>
  </UModal>
</template>