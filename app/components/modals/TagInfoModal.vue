<script setup lang="ts">
import {
  DEFAULT_LOCALE_FALLBACK,
  TRANSLATION_LANGUAGES,
} from '#shared/constants'
import { formatI18nKeyDisplay } from '#shared/utils'
import { isEmpty, omit } from 'lodash-es'
import type { ZTagState } from '~/composables/useEditTagState'
import { zTagState } from '~/composables/useEditTagState'
import InputModal from './InputModal.vue'
import { AlertModal, HistoryModal } from '#components'
import type { ITranslationLog } from '~~/shared/types/Translation'

const props = defineProps<{
  tag: ITag
  clip: string
  loading?: boolean
  /** The last generation for this tag. Cleared when a new one starts. */
  suggestion?: I18nKeySuggestion | null
}>()
const { tag, clip, loading } = toRefs(props)

/*
 * `suggestion` is a prop the parent patches per generation, so waving the panel
 * away is a local decision: it hides here, and the parent's copy is replaced the
 * next time it generates anyway.
 */
const suggestionDismissed = ref(false)
watch(
  () => props.suggestion,
  () => {
    suggestionDismissed.value = false
  }
)
function dismissSuggestion() {
  suggestionDismissed.value = true
}
const tabsItems = [
  {
    label: 'Basic',
    desc: '',
    icon: 'i-lucide:info',
    slot: 'basic',
  },
  {
    label: 'Styles',
    desc: '',
    icon: 'i-devicon:styledcomponents',
    slot: 'styles',
  },
  {
    label: 'Prompt',
    desc: '',
    icon: 'i-mage:stars-c',
    slot: 'prompt',
  },
  {
    label: 'Translations',
    desc: '',
    icon: 'i-garden:translation-exists-stroke-12',
    slot: 'translations',
  },
]

const emit = defineEmits<{
  close: [value: boolean]
  save: [
    payload: {
      tag: Omit<ZTagState, 'translation' | 'settings'>
      settings: ZTagSetting
      translation?: ZTranslation
      close: () => void
    }
  ]
  createTrans: [
    payload: {
      type: 'ocr' | 'link' | 'manual'
      translation?: ZTranslation
      /** Labels for the entry this creates; unused by the `link` branch. */
      releaseIds?: number[]
    }
  ]
  createI18nKey: [
    payload: {
      id: ID
      sourceText: string
      i18nKey?: string
      prompt?: string
    }
  ]
  /** The entry was reverted to draft here, so the tag has to be picked up again. */
  reverted: []
}>()

const overlay = useOverlay()
const projectStore = useProjectStore()

/** The language a key's original text lives in; the source block here edits it. */
const sourceLocale = computed(
  () =>
    projectStore.curProject?.settings?.localeFallback || DEFAULT_LOCALE_FALLBACK
)
const sourceItem = computed(() =>
  TRANSLATION_LANGUAGES.find((o) => o.value === sourceLocale.value)
)
/** The source language is edited in the block above, so it is not a target here. */
const targetLanguages = computed(() =>
  TRANSLATION_LANGUAGES.filter((o) => o.value !== sourceLocale.value)
)

const selectedLanguage = ref<string>(targetLanguages.value[0]?.value ?? '')
const selectedItem = computed(() => {
  const language = TRANSLATION_LANGUAGES.find(
    (o: any) => o.value === selectedLanguage.value
  )
  return {
    icon: language?.icon || 'i-lucide:languages',
    label: language?.label || 'Unknown',
  }
})

const selectedFramework = ref<'vue' | 'react'>('vue')
const { state, seededReleaseIds } = useEditTagState(tag)

/**
 * The locale maps are one value under two names — `vue` and `react` carry the same
 * set, and the save reads one of them — so every edit lands in both. That is what
 * makes a single write enough, and it keeps the copies from drifting apart.
 */
function setLocaleDraft(locale: string, value: string) {
  if (!state.translation) {
    state.translation = {}
  }
  for (const framework of ['vue', 'react'] as const) {
    const temp = state.translation[framework] ?? {}
    temp[locale] = value
    state.translation[framework] = temp
  }
}

/** The original text is the source language's entry, not a field beside the map. */
const sourceText = computed<string>({
  get(): string {
    return (
      (state.translation?.[selectedFramework.value]?.[
        sourceLocale.value
      ] as string) || ''
    )
  },
  set(value: string) {
    setLocaleDraft(sourceLocale.value, value)
  },
})

/**
 * Drives the `New` button, which appears once the original text has been rewritten
 * — that is the only way to end up with a separate entry from here.
 */
const isSourceTextChanged = computed(() => {
  const edited = sourceText.value.trim()
  if (!edited) return false
  const original = String(
    (tag.value.translation?.[selectedFramework.value] as
      | Record<string, string>
      | undefined)?.[sourceLocale.value] ?? ''
  )
  return edited !== original.trim()
})

/**
 * A published entry's text is read-only everywhere — the server refuses the write
 * — so the fields are disabled rather than left to fail on Save. Reverting is the
 * way back, and it is not a local toggle: the entry drops out of published export
 * and the API until someone publishes it again.
 */
const isPublished = computed(() => tag.value.translation?.dirty === false)

const i18nKeyDisplay = computed({
  get: () => formatI18nKeyDisplay(state.i18nKey),
  set: (value: string) => {
    const next = value.trim()
    if (next === formatI18nKeyDisplay(state.i18nKey)) return
    state.i18nKey = next
  },
})

/** Taking a suggestion ends the panel's job, the same way waving it away does. */
function onPickSuggestion(key: string) {
  i18nKeyDisplay.value = key
  dismissSuggestion()
}

/*
 * A typed key can already be in the project, and the tag save path reuses the
 * existing entry silently — so this is the only place a user finds out that the
 * key they typed belongs to a different text.
 */
const keyDuplicate = ref<I18nKeyDuplicate | null>(null)
let duplicateTimer: ReturnType<typeof setTimeout> | undefined

async function lookupDuplicate() {
  const key = state.i18nKey?.trim()
  const projectId = projectStore.curProject.id
  // Nothing to say about the key this tag already carries.
  if (key === (tag.value.i18nKey ?? '').trim()) {
    keyDuplicate.value = null
    return
  }
  if (!key || !validID(projectId)) {
    keyDuplicate.value = null
    return
  }
  const params = new URLSearchParams({
    sourceText: sourceText.value,
  })
  params.append('keys', key)
  const res = await useApi<{ duplicates: I18nKeyDuplicate[] }>(
    `/api/projects/${projectId}/i18n-keys/check?${params}`
  )
  keyDuplicate.value = res?.duplicates?.[0] ?? null
}

watch(
  () => [state.i18nKey, sourceText.value],
  () => {
    clearTimeout(duplicateTimer)
    duplicateTimer = setTimeout(lookupDuplicate, 400)
  },
  { immediate: true }
)
onBeforeUnmount(() => clearTimeout(duplicateTimer))

const editableTranslationContent = computed<string>({
  get(): string {
    return (
      (state.translation?.[selectedFramework.value]?.[
        selectedLanguage.value
      ] as string) || ''
    )
  },
  set(value: string) {
    setLocaleDraft(selectedLanguage.value, value)
  },
})

/** Order-insensitive: the picker appends, so the same set can come back reordered. */
function sameReleaseIds(a: number[], b: number[]) {
  const left = [...a].sort()
  const right = [...b].sort()
  return left.length === right.length && left.every((id, i) => id === right[i])
}

/**
 * A save that would bind an entry whose labels this dialog never saw must not send
 * the default we seeded — that would refile someone else's entry. Every other case
 * is safe: an untouched set is exactly what the bound entry already carries.
 */
function releaseIdsForSave() {
  const chosen = state.releaseIds ?? []
  const bindsUnseenEntry =
    !validID(tag.value.translationID) && Boolean(keyDuplicate.value)
  if (bindsUnseenEntry && sameReleaseIds(chosen, seededReleaseIds.value)) {
    return undefined
  }
  return chosen
}

async function onSubmit() {
  // The debounce may not have run yet, and that lookup is the only thing that says
  // whether this save creates an entry or binds one that already exists.
  if (!validID(tag.value.translationID) && state.i18nKey.trim()) {
    await lookupDuplicate()
  }
  try {
    emit('save', {
      tag: {
        ...omit(state, ['translation', 'settings']),
        releaseIds: releaseIdsForSave(),
      },
      settings: state.settings,
      translation: {
        id: tag.value.translationID,
        ...state.translation,
      },
      close: () => emit('close', true),
    })
  } catch (error) {
    console.error(error)
  }
}

const inputModal = overlay.create(InputModal)
function onCreateTranslation(type: 'ocr' | 'link' | 'manual') {
  if (type === 'manual') {
    const _emit = () => {
      const trimmed = sourceText.value.trim()
      if (!trimmed) return
      emit('createTrans', {
        type,
        translation: {
          ...state.translation,
          fingerprint: fpTranslation(trimmed),
        },
        releaseIds: state.releaseIds,
      })
    }
    if (!sourceText.value.trim()) {
      inputModal.open({
        title: 'Input Dialog',
        label: 'Enter the original text to create',
        textArea: true,
        onClose: (value) => {
          if (value) {
            sourceText.value = value
            _emit()
          }
        },
      })
    } else {
      _emit()
    }
    return
  }
  emit('createTrans', {
    type,
    // Only a branch that creates an entry has one to label: `link` binds an entry
    // that already carries its own.
    releaseIds: type === 'ocr' ? state.releaseIds : undefined,
  })
}

async function onCreateI18nKey() {
  const trimmed = sourceText.value.trim()
  if (!trimmed) return
  emit('createI18nKey', {
    id: tag.value.id,
    i18nKey: state.i18nKey,
    sourceText: trimmed,
    prompt: state.settings.prompt,
  })
}

const revertModal = overlay.create(AlertModal)

/** Lives here rather than with the save flow: nothing about the tag is written. */
function onRevertToDraft() {
  revertModal.open({
    mode: 'warning',
    title: 'Revert to draft',
    message: `Revert “${formatI18nKeyDisplay(
      tag.value.i18nKey ?? ''
    )}” to draft? It will drop out of published export until you publish again.`,
    okText: 'Revert',
    onOk: async (_mode, { close }) => {
      revertModal.patch({ loading: true })
      try {
        await useApi(`/api/projects/${projectStore.curProject.id}/unpublish`, {
          method: 'POST',
          body: { keyIds: [tag.value.translationID] },
        })
        close()
        emit('reverted')
      } finally {
        revertModal.patch({ loading: false })
      }
    },
  })
}

const transHistoryModal = overlay.create(HistoryModal)
async function onViewTranslationHistory() {
  const history = await useApi<ITranslationLog[]>(
    `/api/translation/${tag.value.translationID}/history`,
    {
      method: 'GET',
    }
  )
  transHistoryModal.open({
    title: 'Translation History',
    history,
  })
}

const previewStyle = computed(() => ({
  border: `${state.settings.style.strokeWidth}px solid ${state.settings.style.stroke}`,
  borderRadius: `${state.settings.style.cornerRadius}px`,
}))

const previewLabelStyle = computed(() => {
  let position: {
    top?: number | string
    right?: number | string
    bottom?: number | string
    left?: number | string
    transform: string
  } = {
    top: 0,
    right: 0,
    transform: 'translateY(-100%)',
  }
  switch (state.settings.labelStyle.align) {
    case 'top-left':
      position = {
        top: '2px',
        left: 0,
        transform: 'translateY(-100%)',
      }
      break
    case 'top-right':
    default:
      break
    case 'bottom-left':
      position = {
        bottom: '-2px',
        left: 0,
        transform: 'translateY(100%)',
      }
      break
    case 'bottom-right':
      position = {
        bottom: '-2px',
        right: 0,
        transform: 'translateY(100%)',
      }
      break
    case 'left':
      position = {
        top: '50%',
        left: '-2px',
        transform: 'translateX(-100%) translateY(-50%)',
      }
      break
    case 'right':
      position = {
        top: '50%',
        right: '-2px',
        transform: 'translateX(100%) translateY(-50%)',
      }
      break
  }
  return {
    color: state.settings.labelStyle.fill,
    fontSize: state.settings.labelStyle.fontSize + 'px',
    fontWeight: state.settings.labelStyle.fontWeight,
    ...position,
  }
})
</script>

<template>
  <UModal
    class="max-w-200"
    title="Tag Info"
    :dismissible="!loading"
    @update:open="(isOpen) => !isOpen && emit('close', false)"
  >
    <template #body>
      <UForm
        class="w-full"
        :schema="zTagState"
        :state="state"
        @submit="onSubmit"
        @error="(e) => console.error('error', e)"
      >
        <UTabs
          :items="tabsItems"
          variant="link"
          :ui="{ trigger: 'grow', content: 'mt-2' }"
        >
          <template #basic>
            <div class="flex flex-col gap-2.5">
              <UFormField label="Tag Clip">
                <img
                  class="w-full h-25 object-center object-scale-down"
                  :src="clip"
                />
              </UFormField>
              <div class="w-full flex items-center gap-2.5">
                <UFormField class="flex-1" label="ID">
                  <UInput class="w-full" disabled :model-value="String(tag.id)" />
                </UFormField>
                <UFormField class="flex-1" label="TagID">
                  <UInput class="w-full" disabled :model-value="tag.tagID" />
                </UFormField>
              </div>
              <UFormField
                class="w-full"
                label="Size"
                :ui="{ container: 'grow flex items-center gap-2.5' }"
              >
                <UInput
                  class="grow"
                  disabled
                  :model-value="Math.floor(tag.width)"
                />
                <span class="text-muted">x</span>
                <UInput
                  class="grow"
                  disabled
                  :model-value="Math.floor(tag.height)"
                />
              </UFormField>
              <UFormField
                class="w-full"
                label="Position"
                :ui="{ container: 'grow flex items-center gap-2.5' }"
              >
                <UInput
                  class="grow"
                  disabled
                  :model-value="Math.floor(tag.x)"
                />
                <span class="text-muted">,</span>
                <UInput
                  class="grow"
                  disabled
                  :model-value="Math.floor(tag.y)"
                />
                <UButton
                  :icon="
                    state.settings.locked
                      ? 'i-lucide:lock-keyhole'
                      : 'i-lucide:lock-keyhole-open'
                  "
                  size="md"
                  color="primary"
                  variant="outline"
                  @click="state.settings.locked = !state.settings.locked"
                />
              </UFormField>
            </div>
          </template>
          <template #styles>
            <div class="flex flex-col gap-4">
              <UFormField label="Preview">
                <div
                  class="w-full flex items-center justify-center h-16 image-container"
                >
                  <div
                    class="w-[50%] h-[calc(100%-2rem)] my-auto relative"
                    :style="previewStyle"
                  >
                    <div class="absolute" :style="previewLabelStyle">Label</div>
                  </div>
                </div>
              </UFormField>
              <div class="grid grid-cols-3 gap-4">
                <UFormField label="Stroke Color">
                  <LineColorPicker
                    v-model="state.settings.style.stroke"
                    class="w-full h-8"
                  />
                </UFormField>
                <UFormField label="Stroke Width">
                  <LineWidthSelect
                    v-model="state.settings.style.strokeWidth"
                    class="w-full h-8 line-width-select"
                    :line-color="state.settings.style.stroke"
                  />
                </UFormField>
                <UFormField label="Corner Radius">
                  <div class="flex items-center gap-4 h-8">
                    <USlider
                      v-model="state.settings.style.cornerRadius"
                      class="flex-1"
                      :min="0"
                      :max="10"
                      :step="1"
                    />
                    <span>{{ state.settings.style.cornerRadius }} px</span>
                  </div>
                </UFormField>
                <UFormField label="Text Color">
                  <LineColorPicker
                    v-model="state.settings.labelStyle.fill"
                    class="w-full h-8"
                  />
                </UFormField>
                <UFormField label="Text Weight">
                  <USelect
                    v-model="state.settings.labelStyle.fontWeight"
                    :items="[
                      { label: 'Normal', value: 'normal' },
                      { label: 'Bold', value: 'bold' },
                    ]"
                    class="w-full h-8"
                  />
                </UFormField>
                <UFormField label="Text Size">
                  <div class="flex items-center gap-4 h-8">
                    <USlider
                      v-model="state.settings.labelStyle.fontSize"
                      class="flex-1"
                      :min="12"
                      :max="20"
                      :step="1"
                    />
                    <span>{{ state.settings.labelStyle.fontSize }} px</span>
                  </div>
                </UFormField>
                <UFormField label="Text Align">
                  <USelect
                    v-model="state.settings.labelStyle.align"
                    :items="[
                      { label: 'Top-Left', value: 'top-left' },
                      { label: 'Top-Right', value: 'top-right' },
                      { label: 'Bottom-Left', value: 'bottom-left' },
                      { label: 'Bottom-Right', value: 'bottom-right' },
                      { label: 'Left', value: 'left' },
                      { label: 'Right', value: 'right' },
                    ]"
                    class="w-full h-8"
                  />
                </UFormField>
              </div>
            </div>
          </template>
          <template #prompt>
            <MarkdownPrompt v-model="state.settings.prompt" />
          </template>
          <template #translations>
            <div
              v-if="isEmpty(state.translation)"
              class="flex flex-col items-center justify-center min-h-50 gap-4"
            >
              <UIcon name="mingcute:empty-box-line" size="4rem" />
              <p class="text-muted">No translation yet</p>
              <UButton
                color="neutral"
                variant="soft"
                icon="i-lucide-link"
                :disabled="loading"
                @click="onCreateTranslation('link')"
              >
                Link an existing translation
              </UButton>
              <span>OR</span>
              <div class="flex gap-4">
                <UButton
                  color="neutral"
                  variant="soft"
                  icon="i-lucide:a-large-small"
                  :disabled="loading"
                  @click="onCreateTranslation('manual')"
                >
                  Create New
                </UButton>
                <UButton
                  color="primary"
                  variant="solid"
                  icon="i-mdi:ocr"
                  :disabled="loading"
                  @click="onCreateTranslation('ocr')"
                >
                  Create with OCR
                </UButton>
              </div>
            </div>
            <div v-else class="flex flex-col gap-2.5">
              <!-- The server refuses writes to a published entry, so its fields are
                   disabled instead of being left to fail on Save. -->
              <div
                v-if="isPublished"
                class="flex items-center gap-2 rounded-lg border border-default px-3 py-2"
              >
                <UIcon
                  name="i-lucide:lock"
                  class="size-4 shrink-0 text-muted"
                />
                <p class="text-xs text-muted">
                  Published, so its text is read-only. Revert it to draft to
                  edit.
                </p>
                <UButton
                  class="ml-auto shrink-0"
                  size="xs"
                  color="warning"
                  variant="soft"
                  label="Revert to draft"
                  @click="onRevertToDraft"
                />
              </div>
              <UFormField label="I18n Key">
                <div class="w-full flex flex-col gap-2">
                  <div class="w-full flex items-center gap-2.5">
                    <UInput
                      v-model="i18nKeyDisplay"
                      class="w-full font-mono"
                      :disabled="isPublished"
                    />
                    <AIButton
                      :loading="loading"
                      :disabled="isPublished"
                      @click="onCreateI18nKey"
                    />
                  </div>
                  <AIKeySuggestion
                    v-if="suggestion && !suggestionDismissed"
                    :suggestion="suggestion"
                    :source-text="sourceText"
                    @pick="onPickSuggestion"
                    @cancel="dismissSuggestion"
                  />
                  <KeyDuplicateNote
                    v-if="keyDuplicate"
                    :duplicate="keyDuplicate"
                  />
                </div>
              </UFormField>
              <UFormField
                label="Releases"
                name="releaseIds"
                description="Labels on the translation entry, not on this box."
              >
                <ReleaseSelect
                  v-model="state.releaseIds"
                  :disabled="loading || isPublished"
                />
              </UFormField>
              <UFormField
                :label="sourceItem?.label || 'Text'"
                :ui="{ label: 'w-full' }"
              >
                <template #label="{ label }">
                  <div class="flex items-center gap-3">
                    <div class="flex items-center gap-2">
                      <UIcon
                        :name="sourceItem?.icon || 'i-lucide:languages'"
                        :size="12"
                      />
                      <span>{{ label }}</span>
                    </div>
                    <UButton
                      label="Link"
                      icon="i-lucide-link"
                      size="xs"
                      variant="outline"
                      @click="onCreateTranslation('link')"
                    />
                    <UButton
                      v-if="isSourceTextChanged"
                      label="New"
                      color="neutral"
                      size="xs"
                      variant="outline"
                      icon="i-lucide:copy-plus"
                      @click="onCreateTranslation('manual')"
                    />
                    <UButton
                      label="History"
                      icon="i-lucide:history"
                      size="xs"
                      color="secondary"
                      variant="outline"
                      @click="onViewTranslationHistory"
                    />
                    <span class="mr-0 ml-auto text-xs text-muted">
                      Finger: {{ tag.translation?.fingerprint }}
                    </span>
                  </div>
                </template>
                <template #default>
                  <UTextarea
                    v-model="sourceText"
                    class="w-full"
                    :maxrows="4"
                    autoresize
                    :disabled="isPublished"
                  />
                </template>
              </UFormField>
              <UFormField label="Translations" :ui="{ label: 'w-full' }">
                <template #label="{ label }">
                  <div class="flex items-center gap-3">
                    <span>{{ label }}</span>

                    <USelect
                      v-model="selectedLanguage"
                      :items="targetLanguages"
                      size="sm"
                      class="min-w-50"
                    >
                      <template #default>
                        <div class="flex items-center gap-2">
                          <UIcon :name="selectedItem.icon" :size="12" />
                          <span>{{ selectedItem.label }}</span>
                        </div>
                      </template>
                    </USelect>
                    <AIButton class="[&>span]:h-6 [&>span]:leading-1" />
                    <!--
                      The Vue / React switch is hidden for now: both copies hold the
                      same locale set, so there is nothing to switch between.
                      `selectedFramework` stays as the one read/write target.
                    -->
                  </div>
                </template>
                <template #default>
                  <UTextarea
                    v-model="editableTranslationContent"
                    class="w-full"
                    :maxrows="4"
                    autoresize
                    :disabled="isPublished"
                  />
                </template>
              </UFormField>
            </div>
          </template>
        </UTabs>
        <div class="w-full flex justify-end gap-6 mt-6">
          <UButton
            color="neutral"
            variant="ghost"
            label="Cancel"
            :disabled="loading"
            @click="emit('close', false)"
          />
          <UButton
            label="Save"
            type="submit"
            icon="i-lucide-save"
            :loading="loading"
          />
        </div>
      </UForm>
    </template>
  </UModal>
</template>

<style lang="css" scoped>
.image-container {
  background: repeating-linear-gradient(
    45deg,
    #f0f0f0,
    #f0f0f0 10px,
    #e0e0e0 10px,
    #e0e0e0 20px
  );
}

:deep(.line-width-select) {
  & :deep(.line-wrap) {
    width: 100%;
  }
  & :deep(.line) {
    flex: 1;
    width: 100%;
  }
}
</style>
