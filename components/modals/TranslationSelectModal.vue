<script setup lang="ts">
import type { ITranslation } from '~/types/Translation'

const emit = defineEmits<{
  close: [boolean]
}>()

const search = ref('')

async function onSearch() {
  if (!search.value) return
  const trimed = search.value.trim()
  if (!trimed) return
  const res = await useApi<ITranslation[]>(
    `/api/translation/search?keyword=${trimed}`
  )
  console.log('search res', res)
}
</script>

<template>
  <UModal
    class="max-w-[50rem]"
    :close="{ onClick: () => emit('close', false) }"
    title="Select Translation"
  >
    <template #body>
      <div class="flex flex-col gap-3">
        <div class="flex items-center gap-2.5">
          <UInput v-model="search" placeholder="Search translation">
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
        <UTable></UTable>
      </div>
    </template>
  </UModal>
</template>
