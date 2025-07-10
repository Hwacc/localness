<script setup lang="tsx">
import { UIcon } from '#components'
import type { DropdownMenuItem, TableColumn, TableRow } from '@nuxt/ui'
import { omit } from 'lodash-es'
import { TRANSLATION_LANGUAGES } from '~/constants'
import type { IPagination } from '~/types/Pagination'
import type { ITranslation } from '~/types/Translation'

const emit = defineEmits<{
  save: [ITranslation | null, { close: () => void }]
  close: [boolean]
}>()

const search = ref('')
const table = useTemplateRef('table')
const data = ref<ITranslation[]>([])

const columns: TableColumn<ITranslation>[] = [
  {
    id: 'id',
    accessorKey: 'id',
    header: 'ID',
    enableHiding: false,
    cell: ({ row }) => `#${row.getValue('id')}`,
  },
  {
    id: 'origin',
    accessorKey: 'origin',
    header: 'Text',
    enableHiding: false,
    cell: ({ row }) => (
      <div
        class="w-[20rem] overflow-hidden line-clamp-2"
        title={row.getValue('origin')}
      >
        {row.getValue('origin') || 'N/A'}
      </div>
    ),
  },
  ...TRANSLATION_LANGUAGES.map((lang) => {
    return {
      id: lang.value,
      assessorKey: lang,
      enableHiding: true,
      header: () => (
        <div class="flex items-center gap-1">
          <UIcon name={lang.icon} size="16" />
          <span>{lang.short}</span>
        </div>
      ),
      cell: ({ row }: { row: TableRow<ITranslation> }) => (
        <div
          class="max-w-[20rem] overflow-hidden line-clamp-2"
          title={row.getValue(lang.value)}
        >
          {row.getValue(lang.value) || 'N/A'}
        </div>
      ),
    } as unknown as TableColumn<ITranslation>
  }),
]

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
          console.log('checked', checked)
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

async function onSearch() {
  if (!search.value) return
  const trimed = search.value.trim()
  if (!trimed) return
  const res = await useApi<IPagination<ITranslation[]>>(
    `/api/translation/search?keyword=${trimed}&page=${pagi.value.page}&limit=${pagi.value.limit}`
  )
  if (!res) return
  pagi.value = omit(res, 'data')
  data.value = res.data
}

function onSave() {
  const row = table.value?.tableApi.getSelectedRowModel()
  let translation = null
  if (row?.flatRows.length) {
    translation = row.flatRows[0].original
  }
  emit('save', translation, { close: () => emit('close', true) })
}
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
            placeholder="Search translation"
            @keydown.enter="onSearch"
          >
            <template #trailing>
              <UButton
                v-if="search"
                color="neutral"
                variant="link"
                size="sm"
                icon="i-lucide-circle-x"
                @click="search = ''"
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
        <div class="w-full space-y-2">
          <UTable
            ref="table"
            :columns="columns"
            :data="data"
            :ui="{
              td: 'whitespace-normal',
              tr: 'data-[selected=true]:bg-primary/30 data-[selected=true]:hover:!bg-primary/30',
            }"
            @select="
              (row) => {
                console.log('select', row)
                table?.tableApi.toggleAllRowsSelected(false)
                row.toggleSelected()
              }
            "
          ></UTable>
          <div class="flex justify-center border-t border-default pt-4">
            <UPagination
              :default-page="pagi.page"
              :items-per-page="pagi.limit"
              :total="pagi.total"
              @update:page="
                (p) => {
                  pagi.page = p
                  onSearch()
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
