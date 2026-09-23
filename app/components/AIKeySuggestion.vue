<script setup lang="ts">
const props = withDefaults(
  defineProps<{
    suggestion: I18nKeySuggestion
    /** The text that was sent, to spot an echo that does not match it. */
    sourceText: string
    /**
     * `stacked` for the narrow columns (the two dialogs), `horizontal` for the
     * table's expanded row, which has the whole table to spread across.
     */
    layout?: 'stacked' | 'horizontal'
  }>(),
  { layout: 'stacked' }
)

const emit = defineEmits<{ pick: [key: string]; cancel: [] }>()

/** The model's pick first, then its alternatives; each carries its own score. */
const candidates = computed(() => [
  ...(props.suggestion.key
    ? [{ key: props.suggestion.key, confidence: props.suggestion.confidence }]
    : []),
  ...(props.suggestion.alternatives ?? [])
    .filter((one) => one.key && one.key !== props.suggestion.key)
    .map((one) => ({ key: one.key, confidence: one.confidence })),
])

const candidateKeys = computed(() => candidates.value.map((one) => one.key))

const picked = ref(props.suggestion.key)
// A second generation replaces the whole suggestion, so the picker starts over.
watch(
  () => props.suggestion,
  () => {
    picked.value = props.suggestion.key
  }
)

/*
 * Selecting is free. The name only leaves this panel when it is confirmed, so
 * browsing candidates no longer overwrites the field it is filling — which is
 * what the previous click-to-apply did, once per candidate.
 */
function confirm() {
  emit('pick', picked.value)
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

const confidenceLabel = computed(() =>
  pickedConfidence.value === undefined
    ? ''
    : `${Math.round(pickedConfidence.value * 100)}%`
)

const echoDiffers = computed(
  () => props.suggestion.source.trim() !== props.sourceText.trim()
)
</script>

<template>
  <!--
    The glow is what marks this out as the AI's answer rather than one more form
    box: everything else wears `border-default`, so a plain border here reads as
    just another field.
  -->
  <div class="relative rounded-lg">
    <GlowBorder :border-radius="8" :color="['#A07CFE', '#FE8FB5', '#FFBE7B']" />
    <div class="rounded-lg bg-default p-3">
      <!--
        One row of columns: the whole panel is a single band, so it stays short
        and the alerts sit beside the answer rather than under it.
      -->
      <div v-if="layout === 'horizontal'" class="flex items-start gap-4">
        <div class="flex min-w-0  flex-col gap-1">
          <div class="flex items-center gap-2">
            <UIcon name="i-mdi:robot" size="16" />
            <span class="text-sm font-semibold">AI suggestion</span>
            <UBadge
              v-if="pickedConfidence !== undefined"
              :color="confidenceColor"
              variant="soft"
              :label="confidenceLabel"
            />
          </div>
          <p v-if="suggestion.key" class="font-mono text-base break-all">
            {{ picked }}
          </p>
          <p v-else class="text-xs text-muted">
            Nothing in this text can be named.<template v-if="suggestion.reason">
              {{ suggestion.reason }}</template
            >
          </p>
        </div>

        <div
          v-if="suggestion.key"
          class="flex min-w-0 max-w-2xl flex-col gap-1"
        >
          <div class="flex items-center gap-2">
            <span class="shrink-0 text-xs text-muted">Candidates</span>
            <USelect
              :model-value="picked"
              :items="candidateKeys"
              size="sm"
              class="w-full font-mono"
              @update:model-value="picked = $event"
            />
          </div>
          <p v-if="suggestion.reason" class="text-xs text-muted">
            {{ suggestion.reason }}
          </p>
        </div>

        <div class="flex min-w-0  flex-col gap-1">
          <KeySuggestionNotes
            :suggestion="suggestion"
            :duplicate="pickedDuplicate"
            :echo-differs="echoDiffers"
          />
        </div>

        <!--
          The cross is always offered, even when there is no key to take: a
          "nothing to name" panel still needs a way to be dismissed.
        -->
        <div class="flex shrink-0 items-center gap-1">
          <UButton
            icon="i-lucide:x"
            size="sm"
            color="neutral"
            variant="ghost"
            square
            aria-label="Discard this suggestion"
            @click="emit('cancel')"
          />
          <UButton
            v-if="suggestion.key"
            icon="i-lucide:check"
            size="sm"
            square
            aria-label="Use this key"
            @click="confirm"
          />
        </div>
      </div>

      <!-- Narrow columns keep the original stack, which has no room for bands. -->
      <div v-else class="flex flex-col gap-2.5">
        <div class="flex items-center gap-2">
          <UIcon name="i-mdi:robot" size="16" />
          <span class="text-sm font-semibold">AI suggestion</span>
          <UBadge
            v-if="pickedConfidence !== undefined"
            :color="confidenceColor"
            variant="soft"
            :label="confidenceLabel"
          />
          <div class="ml-auto flex items-center gap-1">
            <UButton
              icon="i-lucide:x"
              size="sm"
              color="neutral"
              variant="ghost"
              square
              aria-label="Discard this suggestion"
              @click="emit('cancel')"
            />
            <UButton
              v-if="suggestion.key"
              icon="i-lucide:check"
              size="sm"
              square
              aria-label="Use this key"
              @click="confirm"
            />
          </div>
        </div>

        <div v-if="!suggestion.key" class="text-xs text-muted">
          Nothing in this text can be named.<template v-if="suggestion.reason">
            {{ suggestion.reason }}</template
          >
        </div>
        <template v-else>
          <p class="font-mono text-base break-all">{{ picked }}</p>
          <div class="flex items-center gap-2">
            <span class="shrink-0 text-xs text-muted">Candidates</span>
            <USelect
              :model-value="picked"
              :items="candidateKeys"
              size="sm"
              class="w-full font-mono"
              @update:model-value="picked = $event"
            />
          </div>
          <p v-if="suggestion.reason" class="text-xs text-muted">
            {{ suggestion.reason }}
          </p>
        </template>

        <KeySuggestionNotes
          :suggestion="suggestion"
          :duplicate="pickedDuplicate"
          :echo-differs="echoDiffers"
        />
      </div>
    </div>
  </div>
</template>
