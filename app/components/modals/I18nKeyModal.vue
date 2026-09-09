<script setup lang="ts">
import {
  DEFAULT_LOCALES,
  TRANSLATION_LANGUAGES,
} from '#shared/constants'
import { formatI18nKeyDisplay } from '#shared/utils'

const props = defineProps<{
  row: II18nKeyRow
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

const state = reactive({
  key: props.row.key,
  origin: props.row.origin,
  locales: {} as Record<string, string>,
})

const localeCodes = computed(() =>
  props.locales.length ? props.locales : [...DEFAULT_LOCALES]
)

function fillFromRow(row: II18nKeyRow) {
  state.key = row.key
  state.origin = row.origin
  const next: Record<string, string> = {}
  for (const code of localeCodes.value) {
    next[code] =
      row.locales.find((locale) => locale.locale === code)?.draftText ?? ''
  }
  state.locales = next
}

fillFromRow(props.row)

watch(
  () => props.row.id,
  () => fillFromRow(props.row)
)

function localeMeta(code: string) {
  return TRANSLATION_LANGUAGES.find((lang) => lang.value === code)
}

const keyDisplay = computed({
  get: () => formatI18nKeyDisplay(state.key),
  set: (value: string) => {
    const next = value.trim()
    if (next === formatI18nKeyDisplay(state.key)) return
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
    if (key !== props.row.key) {
      await useApi(`/api/projects/${props.projectId}/i18n-keys/${props.row.id}`, {
        method: 'PATCH',
        body: { key },
      })
    }
    await useApi(`/api/translation/${props.row.id}`, {
      method: 'POST',
      body: {
        origin,
        vue: state.locales,
      },
    })
    toast.add({
      title: 'Saved',
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
    :title="readonly ? 'View translation' : 'Edit translation'"
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
          label="Save"
          :loading="loading"
          @click="onSave"
        />
      </div>
    </template>
  </UModal>
</template>
