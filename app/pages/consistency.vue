<script setup lang="ts">
import {
  DRAFT_KEY_PREFIX,
  formatI18nKeyDisplay,
  validID,
} from '#shared/utils'
import type { ConsistencyGroup } from '#shared/utils/consistency'

definePageMeta({ middleware: ['protected'], ssr: false })

type ConsistencyMemberView = {
  keyId: number
  key: string
  sourceText: string
  tagCount: number
  pages: string[]
  pageCount: number
  /** A stable representative tag for the editor deep link; null when unbound. */
  sample: { pageId: number; tagId: number } | null
}

type ConsistencyReport = {
  sourceLocale: string
  scannedKeys: number
  groups: Array<ConsistencyGroup & { members: ConsistencyMemberView[] }>
}

/**
 * One section per shipped check — the page is the container that future
 * checks (semantic similarity, design drift) slot into without reshaping.
 * Severity lives on the section, not on each card.
 */
const sections = [
  {
    severity: 'exact' as const,
    title: 'Identical text',
    color: 'error' as const,
    description:
      'The same source sentence saved under different keys, across every captured design.',
  },
  {
    severity: 'near' as const,
    title: 'Near-identical',
    color: 'warning' as const,
    description:
      'Source texts differing only in capitalization or punctuation — e.g. OK and ok.',
  },
]

const projectStore = useProjectStore()
const { curProject } = storeToRefs(projectStore)
const projectId = computed(() => curProject.value?.id)

const { state: license, load: loadLicense } = useLicenseState()

const loading = ref(false)
const report = ref<ConsistencyReport | null>(null)

const locked = computed(() => license.value != null && !license.value.plus)

function groupsOf(severity: 'exact' | 'near') {
  return (
    report.value?.groups.filter((group) => group.severity === severity) ?? []
  )
}

async function loadReport() {
  if (!validID(projectId.value) || locked.value) return
  report.value = await useApi<ConsistencyReport>(
    `/api/projects/${projectId.value}/consistency`
  )
}

async function load() {
  loading.value = true
  report.value = null
  try {
    if (!license.value) await loadLicense()
    await loadReport()
  } finally {
    loading.value = false
  }
}

onMounted(load)
watch(() => projectId.value, load)

function isDraftKey(key: string) {
  return key.startsWith(DRAFT_KEY_PREFIX)
}

function pageSummary(member: ConsistencyMemberView) {
  const shown = member.pages.join(', ')
  const more = member.pageCount - member.pages.length
  return more > 0 ? `${shown} +${more} more` : shown
}
</script>

<template>
  <div class="h-full min-w-0 overflow-auto bg-muted">
    <header
      class="shrink-0 px-6 py-5 bg-default border-b border-default flex items-baseline gap-3"
    >
      <h1 class="text-xl font-semibold tracking-tight">Consistency</h1>
    </header>

    <div class="p-6 flex flex-col gap-6">
      <UAlert
        v-if="!validID(projectId)"
        color="neutral"
        variant="subtle"
        title="Select a project"
        description="Pick a project in the workspace bar to scan its dictionary."
      />

      <template v-else-if="locked">
        <UAlert
          color="warning"
          variant="subtle"
          title="Plus feature"
          description="Consistency scans every key of the project for duplicate source text — findings stay hidden on the free tier. Ask your administrator to enable Plus."
        />

        <section
          v-for="section in sections"
          :key="section.severity"
          class="flex flex-col gap-2"
        >
          <h2 class="text-sm font-semibold">{{ section.title }}</h2>
          <p class="text-sm text-muted">{{ section.description }}</p>
        </section>

        <section class="flex flex-col gap-1 border-t border-default pt-4">
          <h2 class="text-sm font-semibold text-muted">More checks coming</h2>
          <p class="text-xs text-muted">
            Semantic similarity · Design vs dictionary
          </p>
        </section>
      </template>

      <div v-else-if="loading" class="text-sm text-muted">Scanning…</div>

      <template v-else-if="report">
        <p v-if="report.groups.length" class="text-sm text-muted">
          {{ report.groups.length }} duplicate
          {{ report.groups.length === 1 ? 'group' : 'groups' }} across
          {{ report.scannedKeys }} keys
        </p>

        <template v-if="report.groups.length">
          <section
            v-for="section in sections"
            :key="section.severity"
            class="flex flex-col gap-3"
          >
            <template v-if="groupsOf(section.severity).length">
              <h2 class="flex items-center gap-2">
                <UBadge :color="section.color" variant="subtle" size="md">
                  {{ section.title }}
                </UBadge>
                <span class="text-xs text-muted font-normal">
                  {{ groupsOf(section.severity).length }}
                  {{ groupsOf(section.severity).length === 1 ? 'group' : 'groups' }}
                </span>
              </h2>

              <UCollapsible
                v-for="group in groupsOf(section.severity)"
                :key="group.id"
                class="rounded-xl border border-default bg-default"
              >
                <template #default="{ open }">
                  <button
                    type="button"
                    class="w-full flex items-center gap-2 px-4 py-3 text-left"
                  >
                    <span class="text-sm font-medium truncate">
                      “{{ group.members[0]?.sourceText }}”
                    </span>
                    <span class="ml-auto text-xs text-muted shrink-0">
                      {{ group.members.length }} keys
                    </span>
                    <UIcon
                      name="i-lucide:chevron-down"
                      class="size-4 shrink-0 text-muted transition-transform"
                      :class="open && 'rotate-180'"
                    />
                  </button>
                </template>

                <template #content>
                  <div class="flex flex-col gap-2 px-4 pb-4">
                    <div
                      v-for="member in group.members"
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
                              query: { q: member.sourceText },
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
                  </div>
                </template>
              </UCollapsible>
            </template>
          </section>
        </template>

        <template v-else>
          <p class="text-sm text-muted">
            No duplicates found — scanned {{ report.scannedKeys }} keys in
            {{ report.sourceLocale }}.
          </p>
          <p class="text-sm text-muted">
            Identical and near-identical source texts bound to different keys
            would be listed here.
          </p>
        </template>

        <section class="flex flex-col gap-1 border-t border-default pt-4">
          <h2 class="text-sm font-semibold text-muted">More checks coming</h2>
          <p class="text-xs text-muted">
            Semantic similarity · Design vs dictionary — new checks land here
            as they ship.
          </p>
        </section>
      </template>
    </div>
  </div>
</template>
