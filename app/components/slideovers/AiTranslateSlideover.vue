<script setup lang="ts">
import { formatI18nKeyDisplay } from '#shared/utils'
import { AI_TRANSLATE_MAX_CELLS } from '#shared/schemas/ai-translate'
import type { AiTranslateStatus, AiRunItem } from '~/composables/useAiTranslate'

/**
 * Two steps in one drawer: pick what to translate, then review what came back.
 * Nothing is written until Apply, and everything written is a draft.
 */
const props = defineProps<{
  projectId: ID
  keyIds: number[]
  scopeLabel: string
  localeCodes: string[]
  sourceLocale: string
  status: AiTranslateStatus
}>()

const emit = defineEmits<{ applied: [] }>()

const toast = useToast()
const open = ref(false)
const projectIdRef = computed(() => props.projectId)
const run = useAiTranslateRun(projectIdRef)

const targets = computed(() =>
  props.localeCodes.filter((code) => code !== props.sourceLocale),
)
const chosen = ref<string[]>([])
const overwriteDraft = ref(false)
const includePublished = ref(false)
const applying = ref(false)
const lastBatchId = ref<string | null>(null)
/** The reviewer's own choices; absent means "follow the verdict". */
const picked = ref<Record<string, boolean>>({})
const edits = ref<Record<string, string>>({})

const reviewing = computed(
  () => run.state.value !== 'idle' && run.state.value !== 'starting',
)
const running = computed(() => run.state.value === 'running')
const percent = computed(() =>
  run.counts.value.total
    ? Math.round((run.counts.value.done / run.counts.value.total) * 100)
    : 0,
)

function isPicked(item: AiRunItem) {
  if (item.applied || item.text === null) return false
  return picked.value[item.id] ?? (item.status === 'pass' || item.status === 'fixed')
}

function textOf(item: AiRunItem) {
  return edits.value[item.id] ?? item.text ?? ''
}

const pickedItems = computed(() => run.items.value.filter(isPicked))

watch(open, (value) => {
  if (!value) return
  if (!chosen.value.length) chosen.value = [...targets.value]
  // A batch still running on the server is picked up again, not duplicated.
  if (run.state.value === 'idle' && props.status.activeJobId) {
    run.attach(props.status.activeJobId)
  }
})

async function onStart() {
  picked.value = {}
  edits.value = {}
  lastBatchId.value = null
  try {
    await run.start({
      keyIds: props.keyIds,
      locales: chosen.value,
      overwriteDraft: overwriteDraft.value,
      includePublished: includePublished.value,
    })
  } catch (error) {
    // `useApi` has reported it; a busy project hands back the running job.
    const jobId = (error as { data?: { data?: { jobId?: string } } })?.data?.data
      ?.jobId
    if (jobId) run.attach(jobId)
  }
}

async function onApply() {
  applying.value = true
  try {
    const result = await run.apply(
      pickedItems.value.map((item) => ({ id: item.id, text: textOf(item) })),
    )
    lastBatchId.value = result.applied ? result.batchId : lastBatchId.value
    const skipped =
      result.skipped.alreadyApplied + result.skipped.filled + result.skipped.quota
    toast.add({
      title: `${result.applied} draft(s) written`,
      description: skipped ? `${skipped} skipped (filled meanwhile or over today's limit)` : undefined,
      icon: 'i-lucide:check',
      color: 'success',
    })
    emit('applied')
  } finally {
    applying.value = false
  }
}

async function onRevert() {
  if (!lastBatchId.value) return
  const result = await run.revert(lastBatchId.value)
  toast.add({
    title: `${result.reverted} draft(s) reverted`,
    icon: 'i-lucide:undo-2',
  })
  lastBatchId.value = null
  emit('applied')
}

function onNewBatch() {
  run.reset()
  picked.value = {}
  edits.value = {}
}

const rowColor: Record<AiRunItem['status'], string> = {
  pending: '',
  pass: '',
  fixed: '',
  fail: 'border-error/60 bg-error/5',
  error: 'border-error/60 bg-error/5',
}
</script>

<template>
  <USlideover
    v-model:open="open"
    title="AI pre-translation"
    :description="`${scopeLabel} · ${status.model}`"
    side="right"
    :close="{ icon: 'i-lucide:x' }"
    :ui="{
      content:
        'max-w-3xl sm:shadow-[-16px_0_48px_-8px_rgb(0_0_0/0.75)] sm:ring-0 border-l border-accented',
      body: 'p-4 sm:p-4',
    }"
  >
    <UButton
      size="sm"
      color="neutral"
      variant="soft"
      label="AI pre-translate"
      icon="i-lucide:sparkles"
      :disabled="!keyIds.length"
    />

    <template #body>
      <div v-if="!reviewing" class="flex flex-col gap-5">
        <section class="flex flex-col gap-2">
          <p class="text-sm font-medium">Target languages</p>
          <div class="flex flex-wrap gap-x-4 gap-y-2">
            <label
              v-for="code in targets"
              :key="code"
              class="flex items-center gap-1.5 text-sm"
            >
              <UCheckbox
                :model-value="chosen.includes(code)"
                @update:model-value="
                  chosen = $event
                    ? [...chosen, code]
                    : chosen.filter((one) => one !== code)
                "
              />
              <LocaleBadge :locale="code" />
            </label>
          </div>
        </section>
        <section class="flex flex-col gap-2">
          <p class="text-sm font-medium">Which cells</p>
          <p class="text-xs text-muted">
            Empty cells are always filled. Published text that is up to date is
            never touched.
          </p>
          <UCheckbox
            v-model="overwriteDraft"
            label="Overwrite existing drafts"
          />
          <UCheckbox
            v-model="includePublished"
            label="Re-translate published text that is outdated"
            description="The result is a new draft; the published text stays live until you publish."
          />
        </section>
        <UAlert
          color="neutral"
          variant="subtle"
          icon="i-lucide:shield-alert"
          title="Text leaves this server"
          :description="`Source text is sent to the configured model (${status.model}). Up to ${AI_TRANSLATE_MAX_CELLS} cells per batch.`"
        />
        <p v-if="status.quota.limit !== null" class="text-xs text-muted">
          Today: {{ status.quota.used }} / {{ status.quota.limit }} used.
        </p>
      </div>

      <div v-else class="flex flex-col gap-4">
        <div class="flex flex-col gap-2">
          <UProgress :model-value="percent" size="sm" />
          <div class="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted">
            <span>{{ run.counts.value.done }} / {{ run.counts.value.total }}</span>
            <span class="text-success">{{ run.counts.value.pass }} pass</span>
            <span>{{ run.counts.value.fixed }} fixed</span>
            <span class="text-error">{{ run.counts.value.fail }} fail</span>
            <span v-if="run.counts.value.error" class="text-error">
              {{ run.counts.value.error }} error
            </span>
            <span v-if="run.capped.value">
              {{ run.capped.value }} more not included (max
              {{ AI_TRANSLATE_MAX_CELLS }} per batch)
            </span>
            <UButton
              v-if="running"
              class="ml-auto"
              size="xs"
              color="neutral"
              variant="soft"
              icon="i-lucide:square"
              label="Cancel"
              @click="run.cancel"
            />
            <UButton
              v-else-if="run.counts.value.error"
              class="ml-auto"
              size="xs"
              color="neutral"
              variant="soft"
              icon="i-lucide:rotate-cw"
              label="Retry failed"
              @click="run.retry"
            />
          </div>
        </div>

        <ul class="flex flex-col gap-2">
          <li
            v-for="item in run.items.value"
            :key="item.id"
            class="rounded-md border border-default p-3 flex flex-col gap-2"
            :class="rowColor[item.status]"
          >
            <div class="flex items-center gap-2 text-xs">
              <UCheckbox
                :model-value="isPicked(item)"
                :disabled="item.applied || item.text === null"
                @update:model-value="picked[item.id] = Boolean($event)"
              />
              <span class="truncate font-mono text-muted">
                {{ formatI18nKeyDisplay(item.key) }}
              </span>
              <LocaleBadge :locale="item.locale" />
              <UBadge v-if="item.applied" size="sm" color="success" variant="subtle" label="Applied" />
              <UBadge v-else-if="item.status === 'fixed'" size="sm" color="warning" variant="subtle" label="Fixed" />
            </div>
            <p class="text-xs text-muted whitespace-pre-wrap break-words">
              {{ item.source }}
            </p>
            <UTextarea
              v-if="item.text !== null"
              :model-value="textOf(item)"
              class="w-full"
              :rows="2"
              :maxrows="6"
              autoresize
              :disabled="item.applied"
              @update:model-value="edits[item.id] = $event as string"
            />
            <p v-else-if="item.status === 'error'" class="text-xs text-error">
              {{ item.error || 'The model request failed' }}
            </p>
            <p v-else class="text-xs text-muted">Waiting…</p>
            <ul v-if="item.issues?.length" class="text-xs text-error flex flex-col gap-0.5">
              <li v-for="issue in item.issues" :key="issue.ruleId + issue.message">
                {{ issue.message }}
              </li>
            </ul>
          </li>
        </ul>
      </div>
    </template>

    <template #footer>
      <div class="w-full flex items-center justify-end gap-3">
        <template v-if="!reviewing">
          <UButton color="neutral" variant="ghost" label="Close" @click="open = false" />
          <UButton
            icon="i-lucide:sparkles"
            label="Start"
            :loading="run.state.value === 'starting'"
            :disabled="!chosen.length"
            @click="onStart"
          />
        </template>
        <template v-else>
          <UButton
            v-if="lastBatchId"
            color="neutral"
            variant="ghost"
            icon="i-lucide:undo-2"
            label="Revert last batch"
            @click="onRevert"
          />
          <UButton
            v-if="!running"
            color="neutral"
            variant="ghost"
            label="New batch"
            @click="onNewBatch"
          />
          <UButton
            icon="i-lucide:check"
            :label="`Apply ${pickedItems.length} as drafts`"
            :loading="applying"
            :disabled="running || !pickedItems.length"
            @click="onApply"
          />
        </template>
      </div>
    </template>
  </USlideover>
</template>
