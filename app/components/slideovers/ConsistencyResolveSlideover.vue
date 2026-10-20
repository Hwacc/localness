<script setup lang="ts">
import { AlertModal } from '#components'
import { formatI18nKeyDisplay } from '#shared/utils'
import {
  findingIssueViews,
  isPublishedKey,
  autoFix,
  DEFAULT_SCAN_SETTINGS,
  mergeBlockReason,
  memberBadges,
  outdatedOnSourceSave,
  planLocaleChoices,
  recheckLocale,
  ruleCopy,
  suggestKeeper,
  type FingerprintedLocale,
  type PluralFamily,
  type IssueView,
  type LocaleChoice,
  type MergeCandidate,
  type ReportFinding,
  type ScanSettings,
} from '#shared/utils/consistency'

/**
 * One place to act on a finding: the screenshots its keys are drawn on, on the
 * left; on the right, the action its category calls for — merge duplicates,
 * fix-and-publish a translation, or delete an orphan. Every action is complete
 * in one click; the full Translations / Editor pages are escapes in the footer.
 */
const props = defineProps<{
  projectId: ID
  finding: ReportFinding | null
}>()

const open = defineModel<boolean>('open', { default: false })
const emit = defineEmits<{ changed: []; ignore: [] }>()

const overlay = useOverlay()
const toast = useToast()
const confirmModal = overlay.create(AlertModal)

type MemberData = MergeCandidate & {
  sourceText: string
  pendingSourceText?: string
  fingerprint: string
  locales: FingerprintedLocale[]
  pluralFamily?: PluralFamily
}

const loading = ref(false)
const busy = ref(false)
/** Something was written; the report reloads when the drawer closes. */
const touched = ref(false)
const sourceLocale = ref('')
const members = ref<MemberData[]>([])
/** The project's current Consistency settings, so the live check never contradicts them. */
const scanSettings = ref<ScanSettings>(DEFAULT_SCAN_SETTINGS)

const category = computed(() => props.finding?.category)
const memberById = computed(
  () => new Map(members.value.map((member) => [member.keyId, member]))
)

// ── Design (left) ──────────────────────────────────────────────────────────

const PALETTE = ['#f97316', '#22d3ee', '#a3e635', '#e879f9', '#facc15', '#60a5fa']
const colorOf = (keyId: number) => {
  const index = (props.finding?.keys ?? []).findIndex((m) => m.keyId === keyId)
  return PALETTE[Math.max(index, 0) % PALETTE.length]!
}

type Box = II18nKeyRefTag & { keyId: number }
type RefPage = { id: number; name: string; image: string | null; boxes: Box[] }
type RefsResponse = {
  pages: Array<{ id: number; name: string; image: string | null; tags: II18nKeyRefTag[] }>
}

const pages = ref<RefPage[]>([])
const selectedPageId = ref<number>()
const focusKeyId = ref<number | null>(null)
/** Legend pick the preview zooms to; null frames every member on the page. */
const zoomKeyId = ref<number | null>(null)

const selectedPage = computed(
  () => pages.value.find((page) => page.id === selectedPageId.value) ?? pages.value[0]
)

/** Boxes recoloured per key, so several members on one page stay apart. */
const coloredBoxes = computed(() =>
  (selectedPage.value?.boxes ?? []).map((box) => ({
    ...box,
    settings: {
      ...(box.settings ?? {}),
      style: {
        ...(box.settings?.style ?? {}),
        stroke: colorOf(box.keyId),
        strokeWidth: box.keyId === focusKeyId.value ? 3 : 2,
      },
    } as II18nKeyRefTag['settings'],
  }))
)

const zoomBoxIds = computed(() =>
  zoomKeyId.value == null
    ? []
    : (selectedPage.value?.boxes ?? [])
        .filter((box) => box.keyId === zoomKeyId.value)
        .map((box) => box.id)
)

function zoomToMember(keyId: number) {
  zoomKeyId.value = zoomKeyId.value === keyId ? null : keyId
  focusMember(keyId)
}

function focusMember(keyId: number) {
  focusKeyId.value = keyId
  const onPage = selectedPage.value?.boxes.some((box) => box.keyId === keyId)
  if (onPage) return
  const page = pages.value.find((p) => p.boxes.some((box) => box.keyId === keyId))
  if (page) selectedPageId.value = page.id
}

async function loadPages() {
  const keys = props.finding?.keys ?? []
  const refs = await Promise.all(
    keys.map((member) =>
      useApi<RefsResponse>(
        `/api/projects/${props.projectId}/i18n-keys/${member.keyId}/refs`
      )
    )
  )
  const merged = new Map<number, RefPage>()
  keys.forEach((member, index) => {
    for (const page of refs[index]?.pages ?? []) {
      let target = merged.get(page.id)
      if (!target) {
        target = { id: page.id, name: page.name, image: page.image, boxes: [] }
        merged.set(page.id, target)
      }
      for (const tag of page.tags) target.boxes.push({ ...tag, keyId: member.keyId })
    }
  })
  pages.value = [...merged.values()].sort((a, b) => a.name.localeCompare(b.name))
  selectedPageId.value = pages.value[0]?.id
  if (focusKeyId.value != null) focusMember(focusKeyId.value)
}

// ── Members ────────────────────────────────────────────────────────────────

async function loadMembers() {
  const ids = (props.finding?.keys ?? []).map((member) => member.keyId)
  if (!ids.length) {
    members.value = []
    return
  }
  const res = await useApi<{
    sourceLocale: string
    settings: ScanSettings
    keys: MemberData[]
  }>(`/api/projects/${props.projectId}/consistency/keys`, {
    query: { keyIds: ids.join(',') },
  })
  sourceLocale.value = res?.sourceLocale ?? ''
  scanSettings.value = res?.settings ?? DEFAULT_SCAN_SETTINGS
  members.value = res?.keys ?? []
}

async function load() {
  loading.value = true
  focusKeyId.value = props.finding?.keys[0]?.keyId ?? null
  zoomKeyId.value = null
  try {
    await Promise.all([loadMembers(), loadPages()])
    resetMerge()
    resetFix()
  } finally {
    loading.value = false
  }
}

watch(
  () => [open.value, props.finding] as const,
  ([isOpen], [wasOpen]) => {
    if (isOpen && (!wasOpen || !busy.value)) load()
    if (!isOpen && wasOpen && touched.value) {
      touched.value = false
      emit('changed')
    }
  }
)

function revertToDraft(member: MemberData) {
  confirmModal.open({
    mode: 'warning',
    title: 'Revert to draft',
    message: `“${formatI18nKeyDisplay(member.key)}” stops being published in every language — the delivery API and Git no longer serve it. Do this only if no code reads this key name, or you are about to merge it into another key.`,
    okText: 'Revert to draft',
    onOk: async (_mode, { close }) => {
      try {
        await useApi(`/api/projects/${props.projectId}/unpublish`, {
          method: 'POST',
          body: { keyIds: [member.keyId] },
        })
        touched.value = true
        await loadMembers()
        resetMerge(keeperId.value)
      } finally {
        close()
      }
    },
  })
}

// ── Merge (duplicates) ─────────────────────────────────────────────────────

const keeperId = ref<number | null>(null)
const mergeIds = ref<number[]>([])
const picks = ref<Record<string, number>>({})

const suggestion = computed(() => suggestKeeper(members.value))
const keeper = computed(() =>
  keeperId.value == null ? undefined : memberById.value.get(keeperId.value)
)
const mergedMembers = computed(() =>
  members.value.filter((member) => mergeIds.value.includes(member.keyId))
)
const plan = computed<LocaleChoice[]>(() =>
  keeper.value
    ? planLocaleChoices(keeper.value, mergedMembers.value, sourceLocale.value)
    : []
)
const conflictCount = computed(
  () => plan.value.filter((choice) => choice.status === 'conflict').length
)
const movingTags = computed(() =>
  mergedMembers.value.reduce((sum, member) => sum + member.tagCount, 0)
)

function resetMerge(preferKeeper: number | null = null) {
  const keep =
    preferKeeper != null && memberById.value.has(preferKeeper)
      ? preferKeeper
      : (suggestion.value?.keyId ?? null)
  keeperId.value = keep
  mergeIds.value = members.value
    .filter((member) => member.keyId !== keep && !mergeBlockReason(member))
    .map((member) => member.keyId)
  picks.value = {}
}

function chooseKeeper(keyId: number) {
  if (keyId !== keeperId.value) resetMerge(keyId)
}

function toggleMerge(keyId: number, on: boolean) {
  mergeIds.value = on
    ? [...new Set([...mergeIds.value, keyId])]
    : mergeIds.value.filter((id) => id !== keyId)
  picks.value = {}
}

const pickOf = (choice: LocaleChoice) => picks.value[choice.locale] ?? choice.defaultKeyId

function keysLabel(keyIds: number[]) {
  return keyIds
    .map((id) => formatI18nKeyDisplay(memberById.value.get(id)?.key ?? String(id)))
    .join(', ')
}

async function merge() {
  if (!keeper.value || !mergedMembers.value.length || busy.value) return
  busy.value = true
  try {
    const res = await useApi<{ movedTags: number; writtenLocales: string[] }>(
      `/api/projects/${props.projectId}/consistency/merge`,
      {
        method: 'POST',
        body: {
          keeperId: keeper.value.keyId,
          mergeKeyIds: mergeIds.value,
          picks: picks.value,
        },
      }
    )
    toast.add({
      title: 'Keys merged',
      description: `${mergedMembers.value.length} key(s) merged into ${formatI18nKeyDisplay(keeper.value.key)} · ${res?.movedTags ?? 0} tag(s) moved.`,
      color: 'success',
      icon: 'i-lucide:circle-check',
    })
    touched.value = true
    open.value = false
  } finally {
    busy.value = false
  }
}

// ── Fix (mismatch / lint) ──────────────────────────────────────────────────

const lead = computed(() => members.value[0])
const texts = ref<Record<string, string>>({})
const savedLocales = ref<string[]>([])
const autoFixPreview = ref<Record<string, string | null>>({})

const issueLocales = computed(() =>
  props.finding ? findingIssueViews(props.finding).map((issue) => issue.locale) : []
)

function publishedOf(member: MemberData | undefined, locale: string) {
  return member?.locales.find((row) => row.locale === locale)?.publishedText ?? ''
}

function resetFix() {
  const next: Record<string, string> = {}
  for (const locale of issueLocales.value) next[locale] = publishedOf(lead.value, locale)
  texts.value = next
  savedLocales.value = []
  autoFixPreview.value = {}
}

/** The rule's verdict on what is in the editor right now. */
function liveIssue(locale: string): IssueView | null {
  const finding = props.finding
  const member = lead.value
  if (!finding || !member) return null
  const hit = recheckLocale(
    finding.ruleId,
    member,
    sourceLocale.value,
    locale,
    texts.value[locale] ?? '',
    scanSettings.value
  )
  if (!hit) return null
  return findingIssueViews({ ...finding, meta: { ...finding.meta, issues: [hit] } })[0] ?? null
}

const isEdited = (locale: string) =>
  (texts.value[locale] ?? '') !== publishedOf(lead.value, locale)

/** Translations a source save would mark Outdated; zero keeps the hint silent. */
function outdatedOnSave(locale: string): number {
  const member = lead.value
  if (!member || locale !== sourceLocale.value || !isEdited(locale)) return 0
  return outdatedOnSourceSave({
    sourceLocale: sourceLocale.value,
    fingerprint: member.fingerprint,
    locales: member.locales,
    text: texts.value[locale] ?? '',
  })
}

/** Lint rewrite or a one-for-one token swap; null when neither applies. */
function autoFixOf(locale: string): string | null {
  const finding = props.finding
  const member = lead.value
  if (!finding || !member) return null
  return autoFix(
    finding.ruleId,
    member,
    sourceLocale.value,
    locale,
    texts.value[locale] ?? '',
    scanSettings.value
  )
}

function proposeAutoFix(locale: string) {
  autoFixPreview.value = {
    ...autoFixPreview.value,
    [locale]: autoFixOf(locale),
  }
}

function applyAutoFix(locale: string) {
  const next = autoFixPreview.value[locale]
  if (next) texts.value = { ...texts.value, [locale]: next }
  autoFixPreview.value = { ...autoFixPreview.value, [locale]: null }
}

const canAutoFix = (locale: string) => autoFixOf(locale) !== null

async function saveAndPublish(locale: string) {
  const member = lead.value
  const text = texts.value[locale] ?? ''
  if (!member || !text.trim() || busy.value) return
  busy.value = true
  try {
    const res = await useApi<{ fingerprint: string; locales: FingerprintedLocale[] }>(
      `/api/projects/${props.projectId}/consistency/fix`,
      { method: 'POST', body: { keyId: member.keyId, locale, text } }
    )
    if (res?.locales) {
      members.value = members.value.map((m) =>
        m.keyId === member.keyId
          ? { ...m, fingerprint: res.fingerprint, locales: res.locales }
          : m
      )
    }
    savedLocales.value = [...new Set([...savedLocales.value, locale])]
    touched.value = true
    toast.add({
      title: `${locale} published`,
      color: 'success',
      icon: 'i-lucide:circle-check',
    })
  } finally {
    busy.value = false
  }
}

// ── Orphan ─────────────────────────────────────────────────────────────────

function deleteOrphan() {
  const member = lead.value
  if (!member) return
  confirmModal.open({
    mode: 'delete',
    title: 'Delete key',
    message: `Delete “${formatI18nKeyDisplay(member.key)}” and its translations in every language? No design references it. This cannot be undone.`,
    okText: 'Delete',
    onOk: async (_mode, { close }) => {
      try {
        await useApi(`/api/translation/${member.keyId}`, { method: 'DELETE' })
        toast.add({
          title: 'Key deleted',
          color: 'success',
          icon: 'i-lucide:circle-check',
        })
        touched.value = true
        open.value = false
      } finally {
        close()
      }
    },
  })
}

// ── Footer escapes ─────────────────────────────────────────────────────────

/*
 * Duplicates search their shared sentence so every member lists together; a
 * single-key finding searches its key name, which no other key shares.
 */
const translationsLink = computed(() => {
  const lead = props.finding?.keys[0]
  const q =
    props.finding?.category === 'duplicate'
      ? lead?.sourceText || lead?.key
      : lead?.key
  return { path: '/translations', query: { q: q ?? '', scope: 'all' } }
})

function openInEditor() {
  const page = selectedPage.value
  if (!page) return
  const tag =
    page.boxes.find((box) => box.keyId === focusKeyId.value) ?? page.boxes[0]
  open.value = false
  navigateTo({
    path: '/editor',
    query: {
      pageId: String(page.id),
      ...(tag && validID(tag.id) ? { tagId: String(tag.id) } : {}),
    },
  })
}

function markNotAnIssue() {
  open.value = false
  emit('ignore')
}

const title = computed(() => {
  const label = props.finding
    ? (ruleCopy[props.finding.ruleId]?.label ?? props.finding.ruleId)
    : ''
  return `Resolve · ${label}`
})
</script>

<template>
  <USlideover
    v-model:open="open"
    :title="title"
    :description="finding ? ruleCopy[finding.ruleId]?.hint : undefined"
    side="right"
    :close="{ icon: 'i-lucide:x' }"
    class="max-w-6xl"
    :ui="{
      content:
        'sm:shadow-[-16px_0_48px_-8px_rgb(0_0_0/0.75)] sm:ring-0 border-l border-accented',
      body: 'p-0 sm:p-0',
      footer: 'p-4 sm:p-4',
    }"
  >
    <template #body>
      <div class="flex h-full min-h-96">
        <!-- Design -->
        <section
          class="w-[44%] shrink-0 border-r border-default flex flex-col min-h-0 bg-muted"
        >
          <div
            v-if="pages.length > 1"
            class="flex flex-wrap gap-1 p-2 border-b border-default"
          >
            <UButton
              v-for="page in pages"
              :key="page.id"
              size="xs"
              :color="page.id === selectedPage?.id ? 'primary' : 'neutral'"
              :variant="page.id === selectedPage?.id ? 'soft' : 'ghost'"
              @click="selectedPageId = page.id"
            >
              {{ page.name }}
              <span class="text-muted">{{ page.boxes.length }}</span>
            </UButton>
          </div>
          <div class="flex-1 min-h-0">
            <p v-if="loading" class="text-sm text-muted p-6 text-center">Loading…</p>
            <p v-else-if="!pages.length" class="text-sm text-muted p-6 text-center">
              Not drawn on any design.
            </p>
            <ConsistencyDesignFocusPreview
              v-else-if="selectedPage"
              :key="selectedPage.id"
              :image="selectedPage.image"
              :tags="coloredBoxes"
              :focus-ids="zoomBoxIds"
            />
          </div>
          <div
            v-if="(finding?.keys.length ?? 0) > 1"
            class="flex flex-wrap gap-x-3 gap-y-1 p-2 border-t border-default"
          >
            <button
              v-for="member in finding?.keys ?? []"
              :key="member.keyId"
              type="button"
              class="flex items-center gap-1.5 text-xs rounded px-1 -mx-1"
              :class="[
                member.keyId === focusKeyId ? 'text-highlighted' : 'text-muted',
                member.keyId === zoomKeyId ? 'bg-elevated' : '',
              ]"
              :title="
                member.keyId === zoomKeyId ? 'Zoom back to all keys' : 'Zoom to this key'
              "
              @click="zoomToMember(member.keyId)"
            >
              <span
                class="size-2.5 rounded-full"
                :style="{ background: colorOf(member.keyId) }"
              />
              <code>{{ formatI18nKeyDisplay(member.key) }}</code>
            </button>
          </div>
        </section>

        <!-- Action -->
        <section class="flex-1 min-w-0 overflow-auto p-4 flex flex-col gap-4">
          <p v-if="loading" class="text-sm text-muted">Loading…</p>

          <!-- Merge duplicates -->
          <template v-else-if="category === 'duplicate'">
            <div class="flex flex-col gap-1">
              <h3 class="text-sm font-semibold">1 · Keep one key</h3>
              <p class="text-xs text-muted">
                The others are merged into it: their boxes move over, their
                missing translations fill in, then they are deleted.
              </p>
            </div>
            <div class="flex flex-col gap-2">
              <div
                v-for="member in members"
                :key="member.keyId"
                class="rounded-lg border px-3 py-2 flex flex-col gap-1"
                :class="
                  member.keyId === keeperId
                    ? 'border-primary bg-primary/5'
                    : 'border-default'
                "
                @mouseenter="focusMember(member.keyId)"
              >
                <div class="flex items-center gap-2">
                  <input
                    type="radio"
                    name="consistency-keeper"
                    class="accent-primary"
                    :checked="member.keyId === keeperId"
                    :aria-label="`Keep ${member.key}`"
                    @change="chooseKeeper(member.keyId)"
                  />
                  <span
                    class="size-2.5 rounded-full shrink-0"
                    :style="{ background: colorOf(member.keyId) }"
                  />
                  <code class="text-sm font-medium break-all">
                    {{ formatI18nKeyDisplay(member.key) }}
                  </code>
                  <UBadge
                    v-if="isPublishedKey(member)"
                    color="success"
                    variant="subtle"
                    size="xs"
                  >
                    published
                  </UBadge>
                  <UBadge
                    v-for="badge in memberBadges({
                      key: member.key,
                      published: isPublishedKey(member),
                      pendingSourceText: member.pendingSourceText,
                    })"
                    :key="badge.label"
                    :color="badge.color"
                    variant="subtle"
                    size="xs"
                    :title="badge.title"
                  >
                    {{ badge.label }}
                  </UBadge>
                  <span class="ml-auto text-xs text-muted shrink-0">
                    {{ member.tagCount }} {{ member.tagCount === 1 ? 'tag' : 'tags' }}
                  </span>
                </div>
                <p
                  v-if="member.keyId === suggestion?.keyId"
                  class="text-xs text-primary"
                >
                  Suggested: {{ suggestion.reasons.join(' · ') }}
                </p>
                <template v-if="member.keyId !== keeperId">
                  <div
                    v-if="mergeBlockReason(member)"
                    class="flex items-center gap-2 text-xs text-warning"
                  >
                    <UIcon name="i-lucide:lock" class="shrink-0" />
                    <span>Published — code may read this key name, so it is not merged.</span>
                    <UButton
                      size="xs"
                      color="warning"
                      variant="soft"
                      class="ml-auto shrink-0"
                      @click="revertToDraft(member)"
                    >
                      Revert to draft
                    </UButton>
                  </div>
                  <UCheckbox
                    v-else
                    size="xs"
                    :model-value="mergeIds.includes(member.keyId)"
                    label="Merge into the kept key"
                    @update:model-value="toggleMerge(member.keyId, $event === true)"
                  />
                </template>
              </div>
            </div>

            <template v-if="mergedMembers.length">
              <div class="flex flex-col gap-1">
                <h3 class="text-sm font-semibold">2 · Translations</h3>
                <p v-if="!plan.length" class="text-xs text-muted">
                  Nothing to decide — the kept key already has every translation
                  the others carry.
                </p>
              </div>
              <div
                v-for="choice in plan"
                :key="choice.locale"
                class="flex flex-col gap-1 border-l-2 pl-3"
                :class="choice.status === 'conflict' ? 'border-warning' : 'border-success/60'"
              >
                <div class="flex items-center gap-2">
                  <UBadge color="neutral" variant="outline" size="xs">
                    {{ choice.locale }}
                  </UBadge>
                  <span v-if="choice.status === 'fill'" class="text-xs text-muted">
                    missing on the kept key — filled from
                    {{ keysLabel(choice.options[0]!.keyIds) }}
                  </span>
                  <span v-else class="text-xs text-warning">
                    the keys disagree — pick the one to keep
                  </span>
                </div>
                <p
                  v-if="choice.status === 'fill'"
                  class="text-sm whitespace-pre-wrap wrap-break-word"
                >
                  {{ choice.options[0]!.text }}
                </p>
                <label
                  v-for="option in choice.status === 'conflict' ? choice.options : []"
                  :key="option.keyIds.join(',')"
                  class="flex items-start gap-2 text-sm cursor-pointer"
                >
                  <input
                    type="radio"
                    class="mt-1 accent-primary"
                    :name="`pick-${choice.locale}`"
                    :checked="option.keyIds.includes(pickOf(choice))"
                    @change="picks = { ...picks, [choice.locale]: option.keyIds[0]! }"
                  />
                  <span class="flex flex-col">
                    <span class="whitespace-pre-wrap wrap-break-word">{{ option.text }}</span>
                    <span class="text-xs text-muted">{{ keysLabel(option.keyIds) }}</span>
                  </span>
                </label>
              </div>

              <div class="rounded-lg bg-elevated px-3 py-2 text-xs flex flex-col gap-1">
                <p>
                  Keep
                  <code class="font-medium">{{ formatI18nKeyDisplay(keeper?.key ?? '') }}</code>
                  · move {{ movingTags }} {{ movingTags === 1 ? 'box' : 'boxes' }}
                  · delete {{ mergedMembers.length }}
                  {{ mergedMembers.length === 1 ? 'key' : 'keys' }}
                  <template v-if="conflictCount">
                    · {{ conflictCount }} {{ conflictCount === 1 ? 'choice' : 'choices' }} made above
                  </template>
                </p>
                <p v-if="keeper && isPublishedKey(keeper)" class="text-muted">
                  The kept key is published, so translations it takes on are
                  published with it.
                </p>
              </div>
              <UButton
                color="primary"
                icon="i-lucide:merge"
                class="self-start"
                :loading="busy"
                @click="merge"
              >
                Merge {{ mergedMembers.length + 1 }} keys
              </UButton>
            </template>
            <p v-else class="text-xs text-muted">
              Select at least one key to merge — or mark this “Not an issue” if
              the keys are meant to stay apart.
            </p>
          </template>

          <!-- Delete orphan -->
          <template v-else-if="category === 'orphan' && lead">
            <div class="rounded-lg bg-muted px-3 py-2 flex flex-col gap-1">
              <code class="text-sm font-medium break-all">
                {{ formatI18nKeyDisplay(lead.key) }}
              </code>
              <p class="text-sm whitespace-pre-wrap wrap-break-word">
                {{ lead.sourceText }}
              </p>
              <p
                v-if="lead.pendingSourceText"
                class="text-xs text-muted whitespace-pre-wrap wrap-break-word"
              >
                Pending edit: “{{ lead.pendingSourceText }}”
              </p>
              <p class="text-xs text-muted">
                {{ lead.locales.filter((row) => row.draftText).length }} language(s)
              </p>
            </div>
            <p class="text-xs text-muted">
              No design references this key. Delete it if it is a leftover; mark
              it “Not an issue” if it is used without a screenshot.
            </p>
            <div
              v-if="isPublishedKey(lead)"
              class="flex items-center gap-2 text-xs text-warning"
            >
              <UIcon name="i-lucide:lock" class="shrink-0" />
              <span>Published — code may read this key name. Revert it to draft before deleting.</span>
              <UButton
                size="xs"
                color="warning"
                variant="soft"
                class="ml-auto shrink-0"
                @click="revertToDraft(lead)"
              >
                Revert to draft
              </UButton>
            </div>
            <UButton
              color="error"
              variant="soft"
              icon="i-lucide:trash-2"
              class="self-start"
              :disabled="isPublishedKey(lead)"
              @click="deleteOrphan"
            >
              Delete key
            </UButton>
          </template>

          <!-- Fix translations -->
          <template v-else-if="lead">
            <div class="flex flex-col gap-1">
              <code class="text-sm font-medium break-all">
                {{ formatI18nKeyDisplay(lead.key) }}
              </code>
              <p class="text-xs text-muted">
                Edit the published text and publish it. Other languages are not
                touched.
              </p>
            </div>
            <div
              v-for="locale in issueLocales"
              :key="locale"
              class="flex flex-col gap-2 border-l-2 pl-3"
              :class="liveIssue(locale) ? 'border-error/60' : 'border-success/60'"
            >
              <div class="flex items-center gap-2">
                <UBadge color="neutral" variant="outline" size="xs">
                  {{ locale }}
                </UBadge>
                <span v-if="liveIssue(locale)" class="text-sm">
                  {{ liveIssue(locale)?.message }}
                </span>
                <span v-else class="text-sm text-success">Passes this check</span>
                <UBadge
                  v-if="savedLocales.includes(locale) && !isEdited(locale)"
                  color="success"
                  variant="subtle"
                  size="xs"
                  class="ml-auto"
                >
                  published
                </UBadge>
              </div>
              <template v-if="liveIssue(locale)?.sourceSegments">
                <p class="flex flex-wrap items-baseline gap-x-2 text-xs text-muted whitespace-pre-wrap wrap-break-word">
                  <span class="font-medium shrink-0">
                    {{ sourceLocale }}<template v-if="liveIssue(locale)!.sourceKey">
                      · {{ liveIssue(locale)!.sourceKey }}</template>
                  </span>
                  <ConsistencyHighlightedText :segments="liveIssue(locale)!.sourceSegments!" />
                </p>
                <p
                  v-if="liveIssue(locale)!.segments.some((segment) => segment.hit)"
                  class="flex flex-wrap items-baseline gap-x-2 text-xs whitespace-pre-wrap wrap-break-word"
                >
                  <span class="font-medium text-muted shrink-0">Extra</span>
                  <ConsistencyHighlightedText :segments="liveIssue(locale)!.segments" />
                </p>
              </template>
              <UTextarea
                v-model="texts[locale]"
                :rows="2"
                autoresize
                class="w-full"
              />
              <div
                v-if="autoFixPreview[locale]"
                class="rounded-md bg-elevated px-2 py-1.5 text-xs flex flex-col gap-1"
              >
                <p class="whitespace-pre-wrap">{{ autoFixPreview[locale] }}</p>
                <div class="flex gap-1">
                  <UButton size="xs" color="primary" variant="soft" @click="applyAutoFix(locale)">
                    Apply
                  </UButton>
                  <UButton
                    size="xs"
                    color="neutral"
                    variant="ghost"
                    @click="autoFixPreview = { ...autoFixPreview, [locale]: null }"
                  >
                    Cancel
                  </UButton>
                </div>
              </div>
              <p
                v-if="outdatedOnSave(locale)"
                class="text-xs text-muted flex items-center gap-1"
              >
                <UIcon name="i-lucide:info" class="shrink-0" />
                Saving marks {{ outdatedOnSave(locale) }}
                {{ outdatedOnSave(locale) === 1 ? 'other language' : 'other languages' }}
                of this key as Outdated — re-translation clears them.
              </p>
              <div class="flex items-center gap-2">
                <UButton
                  v-if="canAutoFix(locale) && !autoFixPreview[locale]"
                  size="xs"
                  color="neutral"
                  variant="soft"
                  icon="i-lucide:wand-sparkles"
                  @click="proposeAutoFix(locale)"
                >
                  Auto-fix
                </UButton>
                <span
                  v-if="isEdited(locale) && liveIssue(locale)"
                  class="text-xs text-warning"
                >
                  Still fails this check — saving publishes it anyway.
                </span>
                <UButton
                  size="xs"
                  color="primary"
                  icon="i-lucide:upload"
                  class="ml-auto"
                  :disabled="!isEdited(locale) || !texts[locale]?.trim()"
                  :loading="busy"
                  @click="saveAndPublish(locale)"
                >
                  Save &amp; publish {{ locale }}
                </UButton>
              </div>
            </div>
          </template>
        </section>
      </div>
    </template>
    <template #footer>
      <div class="flex items-center gap-2 w-full">
        <UTooltip text="Hidden until its keys or translations change — then it is checked again.">
          <UButton
            color="neutral"
            variant="ghost"
            icon="i-lucide:check-check"
            label="Not an issue"
            @click="markNotAnIssue"
          />
        </UTooltip>
        <UButton
          color="neutral"
          variant="ghost"
          icon="i-lucide:table-2"
          label="Open in Translations"
          :to="translationsLink"
        />
        <UButton
          color="neutral"
          variant="ghost"
          icon="i-lucide:frame"
          label="Open in Editor"
          :disabled="!selectedPage"
          @click="openInEditor"
        />
        <UButton
          color="neutral"
          variant="ghost"
          label="Close"
          class="ml-auto"
          @click="open = false"
        />
      </div>
    </template>
  </USlideover>
</template>
