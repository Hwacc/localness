<script setup lang="ts">
import { KEY_VIOLATION_TEXT } from '#shared/utils/key-convention'

const props = defineProps<{
  suggestion: I18nKeySuggestion
  /** The text that was sent, to spot an echo that does not match it. */
  origin: string
}>()

const emit = defineEmits<{ pick: [key: string] }>()

/*
 * Only the primary key carries a score. The alternatives are an ordered list,
 * best first, so for them the position is the signal.
 */
const candidates = computed(() =>
  [
    ...(props.suggestion.key
      ? [{ key: props.suggestion.key, confidence: props.suggestion.confidence }]
      : []),
    ...(props.suggestion.alternatives ?? [])
      .filter((key) => key && key !== props.suggestion.key)
      .map((key) => ({ key, confidence: undefined as number | undefined })),
  ]
)

const items = computed(() =>
  candidates.value.map((candidate) => ({
    value: candidate.key,
    label:
      candidate.confidence === undefined
        ? candidate.key
        : `${candidate.key} · ${Math.round(candidate.confidence * 100)}%`,
  }))
)

const picked = ref(props.suggestion.key)
// A second generation replaces the whole suggestion, so the picker starts over.
watch(
  () => props.suggestion,
  () => {
    picked.value = props.suggestion.key
  }
)

function onPick(key: string) {
  picked.value = key
  emit('pick', key)
}

const confidenceColor = computed(() => {
  const { confidence } = props.suggestion
  if (confidence === undefined) return 'neutral'
  if (confidence > 0.9) return 'success'
  if (confidence >= 0.7) return 'warning'
  return 'error'
})

const echoDiffers = computed(
  () => props.suggestion.source.trim() !== props.origin.trim()
)
</script>

<template>
  <div class="flex flex-col gap-2 rounded-md border border-default p-2.5">
    <div v-if="!suggestion.key" class="text-xs text-muted">
      Nothing in this text can be named.<template v-if="suggestion.reason">
        {{ suggestion.reason }}</template
      >
    </div>
    <template v-else>
      <div class="flex items-center gap-2.5">
        <USelect
          :model-value="picked"
          :items="items"
          size="sm"
          class="w-full"
          @update:model-value="onPick"
        />
        <UBadge
          v-if="suggestion.confidence !== undefined"
          :color="confidenceColor"
          variant="soft"
          :label="`${Math.round(suggestion.confidence * 100)}%`"
        />
      </div>
      <p v-if="suggestion.reason" class="text-xs text-muted">
        {{ suggestion.reason }}
      </p>
    </template>
    <UAlert
      v-if="suggestion.violations.length"
      color="warning"
      variant="soft"
      icon="i-lucide:triangle-alert"
      title="Does not match the key convention"
      :description="
        suggestion.violations.map((one) => KEY_VIOLATION_TEXT[one]).join('; ')
      "
    />
    <UAlert
      v-if="echoDiffers"
      color="warning"
      variant="soft"
      icon="i-lucide:triangle-alert"
      title="The model changed the source text"
      :description="suggestion.source"
    />
  </div>
</template>
