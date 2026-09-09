<script setup lang="ts">
import {
  DEFAULT_LOCALES,
  TRANSLATION_LANGUAGES,
} from '#shared/constants'
import { useDebounceFn } from '@vueuse/core'

definePageMeta({
  middleware: ['protected'],
})

const projectStore = useProjectStore()
const { projects, curProject } = storeToRefs(projectStore)
const { loggedIn } = useUserSession()
const toast = useToast()

const q = ref('')
const page = ref(1)
const limit = 20
const total = ref(0)
const rows = ref<II18nKeyRow[]>([])
const loading = ref(false)
const publishing = ref(false)
const saving = ref<Record<string, boolean>>({})
const drafts = ref<Record<string, string>>({})

const projectItems = computed(() =>
  projects.value.map((p) => ({
    label: p.name,
    value: p.id,
  }))
)

const selectedProjectId = computed({
  get: () => curProject.value.id || undefined,
  set: (id: ID | undefined) => {
    if (id == null) return
    const found = projects.value.find((p) => String(p.id) === String(id))
    if (found) projectStore.setCurrentProject(found)
  },
})

function parseLocales(raw: unknown): string[] {
  if (Array.isArray(raw) && raw.every((v) => typeof v === 'string')) {
    return raw as string[]
  }
  if (typeof raw === 'string') {
    try {
      const parsed = JSON.parse(raw)
      if (Array.isArray(parsed)) return parsed
    } catch {
      return [...DEFAULT_LOCALES]
    }
  }
  return [...DEFAULT_LOCALES]
}

const localeCodes = computed(() =>
  parseLocales(curProject.value.settings?.locales)
)

function localeMeta(code: string) {
  return TRANSLATION_LANGUAGES.find((l) => l.value === code)
}

function cellKey(rowId: ID, locale: string) {
  return `${rowId}:${locale}`
}

function draftOf(row: II18nKeyRow, locale: string) {
  return row.locales.find((l) => l.locale === locale)?.draftText ?? ''
}

function cellDraft(row: II18nKeyRow, locale: string) {
  const key = cellKey(row.id, locale)
  return drafts.value[key] ?? draftOf(row, locale)
}

function setCellDraft(row: II18nKeyRow, locale: string, value: string) {
  drafts.value = { ...drafts.value, [cellKey(row.id, locale)]: value }
}

async function loadKeys() {
  if (!validID(curProject.value.id)) {
    rows.value = []
    total.value = 0
    return
  }
  loading.value = true
  try {
    const params = new URLSearchParams({
      page: String(page.value),
      limit: String(limit),
    })
    if (q.value.trim()) params.set('q', q.value.trim())
    const res = await useApi<IPagination<II18nKeyRow[]>>(
      `/api/projects/${curProject.value.id}/i18n-keys?${params.toString()}`
    )
    if (!res) return
    rows.value = res.data ?? []
    total.value = res.total
    page.value = res.page
    const next: Record<string, string> = {}
    for (const row of rows.value) {
      for (const code of localeCodes.value) {
        next[cellKey(row.id, code)] = draftOf(row, code)
      }
    }
    drafts.value = next
  } finally {
    loading.value = false
  }
}

const searchDebounced = useDebounceFn(() => {
  page.value = 1
  loadKeys()
}, 300)

watch(q, () => {
  searchDebounced()
})

watch(
  () => curProject.value.id,
  () => {
    page.value = 1
    loadKeys()
  }
)

async function saveDraft(row: II18nKeyRow, locale: string, value: string) {
  const previous = draftOf(row, locale)
  if (previous === value) return
  const key = cellKey(row.id, locale)
  saving.value = { ...saving.value, [key]: true }
  try {
    await useApi(`/api/translation/${row.id}/vue`, {
      method: 'POST',
      body: { [locale]: value },
    })
    const localeRow = row.locales.find((l) => l.locale === locale)
    if (localeRow) {
      localeRow.draftText = value
    } else {
      row.locales.push({
        locale,
        draftText: value,
        publishedText: null,
      })
    }
    row.dirty = row.locales.some(
      (l) => (l.draftText ?? '') !== (l.publishedText ?? '')
    )
  } finally {
    const next = { ...saving.value }
    delete next[key]
    saving.value = next
  }
}

async function publishKeys(keyIds?: number[]) {
  if (!validID(curProject.value.id)) return
  publishing.value = true
  try {
    const res = await useApi<{ updated: number }>(
      `/api/projects/${curProject.value.id}/publish`,
      {
        method: 'POST',
        body: keyIds?.length ? { keyIds } : {},
      }
    )
    toast.add({
      title: 'Published',
      description: `${res?.updated ?? 0} locale row(s) published`,
      color: 'success',
      icon: 'i-lucide:check',
    })
    await loadKeys()
  } finally {
    publishing.value = false
  }
}

onMounted(async () => {
  if (loggedIn.value && projects.value.length === 0) {
    await projectStore.getProjects()
  }
  await loadKeys()
})
</script>

<template>
  <div class="h-full flex flex-col p-4 gap-4 overflow-hidden">
    <div class="flex items-center gap-3 flex-wrap">
      <h1 class="text-lg font-bold">Translations</h1>
      <USelect
        v-model="selectedProjectId"
        class="w-56"
        placeholder="Select project"
        :items="projectItems"
      />
      <UInput
        v-model="q"
        class="w-64"
        placeholder="Search key or origin"
        icon="i-lucide:search"
      />
      <div class="ml-auto flex items-center gap-2">
        <UButton
          color="neutral"
          variant="outline"
          label="Refresh"
          icon="i-lucide:refresh-cw"
          :loading="loading"
          @click="loadKeys"
        />
        <UButton
          color="primary"
          label="Publish all"
          icon="i-lucide:upload"
          :loading="publishing"
          :disabled="!validID(curProject.id) || rows.length === 0"
          @click="publishKeys()"
        />
      </div>
    </div>

    <div
      v-if="!validID(curProject.id)"
      class="flex-1 flex items-center justify-center text-gray-500"
    >
      Select a project to manage translations.
    </div>
    <div v-else class="flex-1 min-h-0 overflow-auto border border-gray-200 rounded">
      <table class="w-full text-sm border-collapse">
        <thead class="sticky top-0 bg-gray-50 z-10">
          <tr>
            <th class="p-2 text-left font-medium whitespace-nowrap">Key</th>
            <th class="p-2 text-left font-medium whitespace-nowrap">Origin</th>
            <th class="p-2 text-left font-medium whitespace-nowrap">Tags</th>
            <th class="p-2 text-left font-medium whitespace-nowrap">Status</th>
            <th
              v-for="code in localeCodes"
              :key="code"
              class="p-2 text-left font-medium whitespace-nowrap min-w-40"
            >
              <span class="inline-flex items-center gap-1">
                <UIcon
                  v-if="localeMeta(code)"
                  :name="localeMeta(code)!.icon"
                  size="14"
                />
                {{ localeMeta(code)?.short || code }}
              </span>
            </th>
            <th class="p-2 text-left font-medium whitespace-nowrap">Actions</th>
          </tr>
        </thead>
        <tbody>
          <tr v-if="loading && rows.length === 0">
            <td class="p-4 text-gray-400" :colspan="5 + localeCodes.length">
              Loading…
            </td>
          </tr>
          <tr v-else-if="rows.length === 0">
            <td class="p-4 text-gray-400" :colspan="5 + localeCodes.length">
              No keys yet. Create tags in the editor to populate this table.
            </td>
          </tr>
          <tr
            v-for="row in rows"
            :key="row.id"
            class="border-t border-gray-100 hover:bg-gray-50/80"
          >
            <td class="p-2 font-mono text-xs align-top max-w-48 break-all">
              {{ row.key }}
            </td>
            <td
              class="p-2 align-top max-w-56 text-gray-600 line-clamp-3"
              :title="row.origin"
            >
              {{ row.origin || '—' }}
            </td>
            <td class="p-2 align-top">{{ row.tagCount }}</td>
            <td class="p-2 align-top">
              <UBadge
                :color="row.dirty ? 'warning' : 'success'"
                variant="subtle"
                size="sm"
              >
                {{ row.dirty ? 'Draft' : 'Published' }}
              </UBadge>
            </td>
            <td
              v-for="code in localeCodes"
              :key="`${row.id}-${code}`"
              class="p-1 align-top min-w-40"
            >
              <UInput
                :model-value="cellDraft(row, code)"
                size="sm"
                class="w-full"
                @update:model-value="
                  (v: string) => setCellDraft(row, code, v ?? '')
                "
                @blur="saveDraft(row, code, cellDraft(row, code))"
              />
            </td>
            <td class="p-2 align-top">
              <UButton
                size="xs"
                variant="outline"
                color="neutral"
                label="Publish"
                :disabled="!row.dirty || publishing"
                @click="publishKeys([Number(row.id)])"
              />
            </td>
          </tr>
        </tbody>
      </table>
    </div>

    <div v-if="total > limit" class="flex justify-center">
      <UPagination
        :page="page"
        :items-per-page="limit"
        :total="total"
        @update:page="
          (p: number) => {
            page = p
            loadKeys()
          }
        "
      />
    </div>
  </div>
</template>
