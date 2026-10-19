<script setup lang="ts">
import { DRAFT_KEY_PREFIX, formatI18nKeyDisplay } from '#shared/utils'
import {
  findingIssueViews,
  ruleCopy,
  type FindingSeverity,
  type ReportFinding,
  type ReportMember,
} from '#shared/utils/consistency'

const props = defineProps<{
  finding: ReportFinding
  /** Active locale filter; narrows the issue rows shown. */
  locales: string[]
}>()

defineEmits<{ ignore: [] }>()

const isDuplicate = computed(() => props.finding.category === 'duplicate')
const lead = computed(() => props.finding.keys[0])

const issues = computed(() => findingIssueViews(props.finding, props.locales))

const diverged = computed(() => {
  const value = props.finding.meta?.diverged
  return Array.isArray(value) ? value.map(String) : []
})

function severityMeta(severity: FindingSeverity) {
  return severity === 'error'
    ? { color: 'error' as const, label: 'Error' }
    : severity === 'warning'
      ? { color: 'warning' as const, label: 'Warning' }
      : { color: 'neutral' as const, label: 'Info' }
}

function isDraftKey(key: string) {
  return key.startsWith(DRAFT_KEY_PREFIX)
}

function pageSummary(member: ReportMember) {
  const shown = member.pages.join(', ')
  const more = member.pageCount - member.pages.length
  return more > 0 ? `${shown} +${more} more` : shown
}
</script>

<template>
  <div class="flex flex-col">
    <div
      class="sticky top-0 z-10 flex items-center gap-2 px-4 py-3 bg-default border-b border-default"
    >
      <UBadge
        :color="severityMeta(finding.severity).color"
        variant="subtle"
        size="xs"
      >
        {{ severityMeta(finding.severity).label }}
      </UBadge>
      <span class="text-sm font-semibold">
        {{ ruleCopy[finding.ruleId]?.label ?? finding.ruleId }}
      </span>
      <UButton
        size="xs"
        color="neutral"
        variant="ghost"
        icon="i-lucide:eye-off"
        class="ml-auto shrink-0"
        @click="$emit('ignore')"
      >
        Ignore
      </UButton>
    </div>

    <p
      v-if="ruleCopy[finding.ruleId]?.hint"
      class="px-4 py-2 text-xs text-muted border-b border-default"
    >
      {{ ruleCopy[finding.ruleId]?.hint }}
    </p>

    <div class="flex flex-col gap-3 p-4">
      <!-- Duplicates: every member side by side in one column of cards. -->
      <template v-if="isDuplicate">
        <div class="flex items-center gap-2">
          <span class="text-sm font-medium truncate">
            “{{ lead?.sourceText }}”
          </span>
          <UBadge
            v-if="diverged.length"
            color="error"
            variant="subtle"
            size="xs"
            class="shrink-0"
          >
            diverged in {{ diverged.join(', ') }}
          </UBadge>
        </div>
        <div
          v-for="member in finding.keys"
          :key="member.keyId"
          class="rounded-lg bg-muted px-3 py-2 flex flex-col gap-0.5"
        >
          <div class="flex items-center gap-2">
            <code class="text-sm font-medium break-all">
              {{ formatI18nKeyDisplay(member.key) }}
            </code>
            <UBadge
              v-if="isDraftKey(member.key)"
              color="neutral"
              variant="subtle"
              size="xs"
            >
              draft
            </UBadge>
            <span class="ml-auto flex items-center gap-1 shrink-0">
              <UButton
                v-if="member.sample"
                size="xs"
                color="neutral"
                variant="ghost"
                icon="i-lucide:frame"
                :to="{
                  path: '/editor',
                  query: {
                    pageId: String(member.sample.pageId),
                    tagId: String(member.sample.tagId),
                  },
                }"
              >
                Open in editor
              </UButton>
              <UButton
                size="xs"
                color="neutral"
                variant="ghost"
                icon="i-lucide:search"
                :to="{
                  path: '/translations',
                  query: { q: member.sourceText, scope: 'all' },
                }"
              >
                Find
              </UButton>
            </span>
          </div>
          <p class="text-sm whitespace-pre-wrap break-words">
            {{ member.sourceText }}
          </p>
          <p class="text-xs text-muted">
            <template v-if="member.pageCount">
              {{ pageSummary(member) }} ·
            </template>
            {{ member.tagCount }}
            {{ member.tagCount === 1 ? 'tag' : 'tags' }}
          </p>
        </div>
      </template>

      <!-- Single-key findings: the key's context first. -->
      <template v-else-if="lead">
        <div class="rounded-lg bg-muted px-3 py-2 flex flex-col gap-0.5">
          <div class="flex items-center gap-2">
            <code class="text-sm font-medium break-all">
              {{ formatI18nKeyDisplay(lead.key) }}
            </code>
            <UBadge
              v-if="isDraftKey(lead.key)"
              color="neutral"
              variant="subtle"
              size="xs"
            >
              draft
            </UBadge>
            <span class="ml-auto flex items-center gap-1 shrink-0">
              <UButton
                v-if="lead.sample"
                size="xs"
                color="neutral"
                variant="ghost"
                icon="i-lucide:frame"
                :to="{
                  path: '/editor',
                  query: {
                    pageId: String(lead.sample.pageId),
                    tagId: String(lead.sample.tagId),
                  },
                }"
              >
                Open in editor
              </UButton>
              <UButton
                size="xs"
                color="neutral"
                variant="ghost"
                icon="i-lucide:search"
                :to="{
                  path: '/translations',
                  query: { q: lead.sourceText, scope: 'all' },
                }"
              >
                Find
              </UButton>
            </span>
          </div>
          <p class="text-sm whitespace-pre-wrap break-words">
            {{ lead.sourceText }}
          </p>
          <p class="text-xs text-muted">
            <template v-if="lead.pageCount">
              {{ pageSummary(lead) }} ·
            </template>
            {{ lead.tagCount }}
            {{ lead.tagCount === 1 ? 'tag' : 'tags' }}
          </p>
        </div>

        <p
          v-if="finding.category === 'orphan'"
          class="text-xs text-muted"
        >
          No frame references this key — a leftover from a deleted design or a
          manual entry. It is a hint, not a fault: creating entries without
          tagging a screenshot is a legitimate workflow.
        </p>
      </template>

      <!--
        Mismatch shows source once (missing tokens marked) then each locale's
        translation with its extra tokens marked — the two-column reading of
        "what broke", aligned top to bottom.
      -->
      <template v-if="issues.length && !isDuplicate">
        <div
          v-if="issues[0]?.sourceSegments"
          class="flex flex-col gap-1 border-l-2 border-warning/60 pl-3"
        >
          <div class="flex items-center gap-2">
            <span class="text-xs font-semibold">Source</span>
          </div>
          <p class="text-xs text-muted whitespace-pre-wrap break-words">
            <ConsistencyHighlightedText :segments="issues[0].sourceSegments" />
          </p>
        </div>

        <div
          v-for="issue in issues"
          :key="issue.locale"
          class="flex flex-col gap-1 border-l-2 border-error/60 pl-3"
        >
          <div class="flex items-center gap-2">
            <UBadge color="neutral" variant="outline" size="xs">
              {{ issue.locale }}
            </UBadge>
            <span class="text-sm">{{ issue.message }}</span>
          </div>
          <p class="text-xs whitespace-pre-wrap break-words">
            <ConsistencyHighlightedText :segments="issue.segments" />
          </p>
        </div>
      </template>
    </div>
  </div>
</template>
