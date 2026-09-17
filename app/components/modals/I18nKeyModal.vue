<script setup lang="ts">
import {
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

const localeCodes = computed(() =>
  props.locales.length ? props.locales : [...DEFAULT_LOCALES]
)

function fillFromRow(row: II18nKeyRow | null | undefined) {
  state.key = row?.key ?? ''
  state.origin = row?.origin ?? ''
  const next: Record<string, string> = {}
  for (const code of localeCodes.value) {
    next[code] =
      row?.locales.find((locale) => locale.locale === code)?.draftText ?? ''
  }
  state.locales = next
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
      <div class="flex flex-col gap-4">
        <UFormField label="Key">
          <UInput
            v-model="keyDisplay"
            class="w-full font-mono"
            :disabled="readonly"
          />
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
        <UFormField
          v-for="code in localeCodes"
          :key="code"
          :label="localeMeta(code)?.label || code"
        >
          <UInput
            v-model="state.locales[code]"
            class="w-full"
            :disabled="readonly"
          />
        </UFormField>
      </div>
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
