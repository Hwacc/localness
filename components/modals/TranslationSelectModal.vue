<script setup lang="tsx">
import type { TableColumn, TableRow } from '@nuxt/ui'
import { TRANSLATION_LANGUAGES } from '~/constants'
import type { ITranslation } from '~/types/Translation'

const emit = defineEmits<{
  close: [boolean]
}>()

const search = ref('')
const table = useTemplateRef('table')
const data = ref<ITranslation[]>([])

const columns: TableColumn<ITranslation>[] = [
  {
    accessorKey: 'id',
    header: 'ID',
    cell: ({ row }) => `#${row.getValue('id')}`,
  },
  {
    accessorKey: 'origin',
    header: 'Text',
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

async function onSearch() {
  if (!search.value) return
  const trimed = search.value.trim()
  if (!trimed) return
  data.value = await useApi<ITranslation[]>(
    `/api/translation/search?keyword=${trimed}`
  )
}
</script>

<template>
  <UModal
    class="max-w-[60rem]"
    :close="{ onClick: () => emit('close', false) }"
    title="Select Translation"
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
          <UDropdownMenu :content="{ align: 'end' }">
            <UButton
              label="Columns"
              color="neutral"
              variant="outline"
              trailing-icon="i-lucide-chevron-down"
              class="ml-auto"
              aria-label="Columns select dropdown"
            />
          </UDropdownMenu>
        </div>
        <div class="w-full space-y-2">
          <UTable
            ref="table"
            :columns="columns"
            :data="data"
            :ui="{
              td: 'whitespace-normal',
            }"
            @select="(row) => {
              console.log('select', row)
            }"
          ></UTable>
          <div class="flex justify-center border-t border-default pt-4">
            <UPagination
              :default-page="
                (table?.tableApi?.getState().pagination.pageIndex || 0) + 1
              "
              :items-per-page="table?.tableApi?.getState().pagination.pageSize"
              :total="table?.tableApi?.getFilteredRowModel().rows.length"
              @update:page="(p) => table?.tableApi?.setPageIndex(p - 1)"
            />
          </div>
        </div>
      </div>
    </template>
  </UModal>
</template>
