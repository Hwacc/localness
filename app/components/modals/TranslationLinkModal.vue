<script setup lang="tsx">
import { UCheckbox, UIcon } from '#components'
import type { DropdownMenuItem, TableColumn, TableRow } from '@nuxt/ui'
import { omit } from 'lodash-es'
import { TRANSLATION_LANGUAGES } from '#shared/constants'
import { formatI18nKeyDisplay } from '#shared/utils'

const emit = defineEmits<{
  save: [ITranslation | null, { close: () => void }]
  close: [boolean]
}>()

const projectStore = useProjectStore()
const { curProject } = storeToRefs(projectStore)

const search = ref('')
const table = useTemplateRef('table')
const data = ref<ITranslation[]>([])
const loading = ref(false)
const rowSelection = ref<Record<string, boolean>>({})

const framework = ref<'vue' | 'react'>('vue')

function rowToTranslation(row: II18nKeyRow): ITranslation {
  const content: TranslationContent = {}
  for (const locale of row.locales) {
    const text = locale.draftText || locale.publishedText || ''
    if (text) content[locale.locale] = text
  }
  return {
    id: row.id,
    origin: row.origin,
    fingerprint: '',
    vue: content,
    react: { ...content },
    key: row.key,
  }
}

const columns = computed<TableColumn<ITranslation>[]>(() => [
  {
    id: 'select',
    header: '',
    enableHiding: false,
    enableSorting: false,
    size: 48,
    cell: ({ row }) => (
      <UCheckbox
        modelValue={row.getIsSelected()}
        onUpdate:modelValue={(value: boolean | 'indeterminate') => {
          const id = String(row.original.id)
          rowSelection.value = value ? { [id]: true } : {}
        }}
      />
    ),
  },
  {
    id: 'id',
    accessorKey: 'id',
    header: 'ID',
    enableHiding: false,
    cell: ({ row }) => `#${row.getValue('id')}`,
  },
  {
    id: 'key',
    accessorKey: 'key',
    header: 'Key',
    enableHiding: false,
    cell: ({ row }) => (
      <code class="text-xs font-mono break-all">
        {formatI18nKeyDisplay(String(row.getValue('key') || '')) || '—'}
      </code>
    ),
  },
  {
    id: 'origin',
    accessorKey: 'origin',
    header: 'Origin',
    enableHiding: false,
    cell: ({ row }) => (
      <div
        class="w-max max-w-[20rem] whitespace-normal line-clamp-2"
        title={row.getValue('origin')}
      >
        {row.getValue('origin') || '—'}
      </div>
    ),
  },
  ...TRANSLATION_LANGUAGES.map((lang) => {
    return {
      id: lang.value,
      accessorKey: lang.value,
      enableHiding: true,
      header: () => (
        <div class="flex items-center gap-1">
          <UIcon name={lang.icon} size="16" />
          <span>{lang.short}</span>
        </div>
      ),
      cell: ({ row }: { row: TableRow<ITranslation> }) => {
        const value = row.original[framework.value]?.[lang.value]
        return (
          <div
            class="w-max max-w-[15rem] whitespace-normal line-clamp-2"
            title={value || ''}
          >
            {value || '—'}
          </div>
        )
      },
    } as unknown as TableColumn<ITranslation>
  }),
])

const columnsDropdownItems = computed<DropdownMenuItem[]>(() => {
  if (!table.value) return []
  const allColumns: any[] = table.value.tableApi.getAllColumns()
  return allColumns
    .filter((col) => col.getCanHide())
    .map((col) => {
      const trans = TRANSLATION_LANGUAGES.find((lang) => lang.value === col.id)
      return {
        type: 'checkbox',
        label: trans?.short || col.id,
        value: col.id,
        icon: trans?.icon,
        checked: col.getIsVisible(),
        onUpdateChecked(checked: boolean) {
          table.value?.tableApi.getColumn(col.id)?.toggleVisibility(!!checked)
        },
        onSelect(e: Event) {
          e.preventDefault()
        },
      }
    })
})

const pagi = ref<{
  page: number
  limit: number
  total: number
  totalPages: number
}>({
  page: 1,
  limit: 10,
  total: 0,
  totalPages: 0,
})

async function loadRows() {
  if (!validID(curProject.value.id)) {
    data.value = []
    pagi.value.total = 0
    return
  }
  loading.value = true
  try {
    const params = new URLSearchParams({
      page: String(pagi.value.page),
      limit: String(pagi.value.limit),
    })
    const q = search.value.trim()
    if (q) params.set('q', q)
    const res = await useApi<IPagination<II18nKeyRow[]>>(
      `/api/projects/${curProject.value.id}/i18n-keys?${params.toString()}`
    )
    if (!res) return
    pagi.value = omit(res, 'data')
    data.value = (res.data ?? []).map(rowToTranslation)
    rowSelection.value = {}
  } finally {
    loading.value = false
  }
}

function onSearch() {
  pagi.value.page = 1
  loadRows()
}

function onSave() {
  const selectedId = Object.keys(rowSelection.value).find(
    (id) => rowSelection.value[id]
  )
  const translation =
    data.value.find((row) => String(row.id) === selectedId) ?? null
  emit('save', translation, { close: () => emit('close', true) })
}

onMounted(() => {
  loadRows()
})
</script>

<template>
  <UModal
    class="max-w-[60rem]"
    title="Select Translation"
    @update:open="(isOpen) => !isOpen && emit('close', false)"
  >
    <template #body>
      <div class="flex flex-col gap-3">
        <div class="flex items-center gap-2.5">
          <UInput
            v-model="search"
            class="w-75"
            placeholder="Search key or origin"
            @keydown.enter="onSearch"
          >
            <template #trailing>
              <UButton
                v-if="search"
                color="neutral"
                variant="link"
                size="sm"
                icon="i-lucide-circle-x"
                @click="
                  () => {
                    search = ''
                    onSearch()
                  }
                "
              />
            </template>
          </UInput>
          <UButton
            color="primary"
            variant="solid"
            icon="i-lucide:search"
            label="Search"
            @click="onSearch"
          />
          <div class="flex items-center ml-auto mr-0 gap-2">
            <FrameworkGroup v-model="framework" />
            <UDropdownMenu
              :ui="{
                group: 'max-h-50',
              }"
              :items="columnsDropdownItems"
              :content="{ align: 'end' }"
            >
              <template #default>
                <UButton
                  label="Columns"
                  color="neutral"
                  variant="outline"
                  trailing-icon="i-lucide-chevron-down"
                  class="ml-auto"
                  aria-label="Columns select dropdown"
                />
              </template>
            </UDropdownMenu>
          </div>
        </div>
        <div class="w-full space-y-2">
          <UTable
            ref="table"
            v-model:row-selection="rowSelection"
            :columns="columns"
            :data="data"
            :loading="loading"
            :get-row-id="(row: ITranslation) => String(row.id)"
            :ui="{
              th: 'p-2.5',
              td: 'p-2.5',
              tr: 'data-[selected=true]:bg-primary/30 data-[selected=true]:hover:!bg-primary/30',
            }"
          >
            <template #empty>
              <div class="py-8 text-center text-sm text-muted">
                {{
                  validID(curProject.id)
                    ? 'No translations in this project yet.'
                    : 'Select a project first.'
                }}
              </div>
            </template>
          </UTable>
          <div class="flex justify-center border-t border-default pt-4">
            <UPagination
              :default-page="pagi.page"
              :items-per-page="pagi.limit"
              :total="pagi.total"
              @update:page="
                (p) => {
                  pagi.page = p
                  loadRows()
                }
              "
            />
          </div>
        </div>
      </div>
      <div class="flex justify-end gap-4 mt-4">
        <UButton
          color="neutral"
          variant="ghost"
          label="Cancel"
          @click="emit('close', false)"
        />
        <UButton
          color="primary"
          variant="solid"
          label="Link"
          icon="i-lucide-link"
          @click="onSave"
        />
      </div>
    </template>
  </UModal>
</template>
