<script setup lang="ts">
import { KEY_VIOLATION_TEXT } from '#shared/utils/key-convention'

const props = defineProps<{
  suggestion: I18nKeySuggestion
  /** The text that was sent, to spot an echo that does not match it. */
  origin: string
}>()

const emit = defineEmits<{ pick: [key: string] }>()

/** The model's pick first, then its alternatives; each carries its own score. */
const candidates = computed(() => [
  ...(props.suggestion.key
    ? [{ key: props.suggestion.key, confidence: props.suggestion.confidence }]
    : []),
  ...(props.suggestion.alternatives ?? [])
    .filter((one) => one.key && one.key !== props.suggestion.key)
    .map((one) => ({ key: one.key, confidence: one.confidence })),
])

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

/*
 * Both the score and the duplicate warning describe the *selected* candidate.
 * Showing the primary's numbers while another one is selected would be a lie.
 */
const pickedConfidence = computed(
  () => candidates.value.find((one) => one.key === picked.value)?.confidence
)

const pickedDuplicate = computed(() =>
  props.suggestion.duplicates.find((one) => one.key === picked.value)
)

const confidenceColor = computed(() => {
  const confidence = pickedConfidence.value
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
  <!--
    The glow is what marks this out as the AI's answer rather than one more form
    box: everything else in the dialog wears `border-default`, so a plain border
    here reads as just another field.
  -->
  <div class="relative rounded-lg">
    <GlowBorder
      :border-radius="8"
      :color="['#A07CFE', '#FE8FB5', '#FFBE7B']"
    />
    <div class="flex flex-col gap-2.5 rounded-lg bg-default p-3">
      <div class="flex items-center gap-2">
        <UIcon name="i-mdi:robot" size="16" />
        <span class="text-sm font-semibold">AI suggestion</span>
        <UBadge
          v-if="pickedConfidence !== undefined"
          class="ml-auto"
          :color="confidenceColor"
          variant="soft"
          :label="`${Math.round(pickedConfidence * 100)}%`"
        />
      </div>

      <div v-if="!suggestion.key" class="text-xs text-muted">
        Nothing in this text can be named.<template v-if="suggestion.reason">
          {{ suggestion.reason }}</template
        >
      </div>
      <template v-else>
        <p class="font-mono text-base break-all">{{ picked }}</p>
        <div class="flex items-center gap-2">
          <span class="text-xs text-muted shrink-0">Candidates</span>
          <USelect
            :model-value="picked"
            :items="candidates.map((one) => one.key)"
            size="sm"
            class="w-full font-mono"
            @update:model-value="onPick"
          />
        </div>
        <p v-if="suggestion.reason" class="text-xs text-muted">
          {{ suggestion.reason }}
        </p>
        <KeyDuplicateNote v-if="pickedDuplicate" :duplicate="pickedDuplicate" />
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
  </div>
</template>
