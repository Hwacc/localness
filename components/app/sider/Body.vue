<script setup lang="ts">
import { AlertModal, PageModal } from '#components'
import type { DropdownMenuItem } from '@nuxt/ui'
import { useDropZone } from '@vueuse/core'
import { isEmpty } from 'lodash-es'
import { injectEditorContext } from '~/providers/EditorProvider.vue'
import type { IPage } from '~/types/Page'

const projectStore = useProjectStore()
const pageList = computed(() => projectStore.curProject?.pages || [])

const { autoSave } = injectEditorContext()
const pageStore = usePageStore()
const editPage = ref<IPage | undefined>(undefined)
const pageMenuItems: DropdownMenuItem[] = [
  {
    label: 'Page Settings',
    icon: 'i-lucide:settings',
    onSelect: showEditPageModal,
  },
  {
    label: 'Delete Page',
    icon: 'i-lucide:trash-2',
    onSelect: showDeleteAlertModal,
  },
]

const qiniuImage = useQiniuImage()
const imageFileData = shallowRef<File | undefined>()
const imageDropZoneRef = useTemplateRef<HTMLElement>('imageDropZoneRef')
const { isOverDropZone } = useDropZone(imageDropZoneRef, {
  dataTypes: ['image/png', 'image/jpeg', 'image/jpg'],
  onDrop: onImageDrop,
})
function onImageDrop(files: File[] | null) {
  imageFileData.value = undefined
  if (!isEmpty(files)) {
    imageFileData.value = files![0]
    showCreatePageModal()
  }
}
async function onPageClick(page: IPage) {
  await autoSave.ask()
  pageStore.setCurrentPage(page)
}

const overlay = useOverlay()
const pageModal = overlay.create(PageModal, {
  props: {
    mode: 'create',
    file: imageFileData.value,
    onSave: async (_, { close }) => {
      close()
    },
    onClose: () => {
      imageFileData.value = undefined
    },
    onDelete: () => {
      imageFileData.value = undefined
    },
  },
})
const alertModal = overlay.create(AlertModal, {
  props: {
    mode: 'info',
    title: '',
    message: '',
    loading: false,
  },
})

function showCreatePageModal() {
  pageModal.patch({
    file: imageFileData.value,
  })
  pageModal.open()
}

async function showEditPageModal() {
  if (!editPage.value) return
  const url = await qiniuImage.get(editPage.value.image)
  pageModal.patch({
    mode: 'edit',
    page: { ...editPage.value, image: url },
  })
  pageModal.open()
}

function showDeleteAlertModal() {
  alertModal.patch({
    mode: 'delete',
    title: 'Delete Page',
    message: 'Are you sure you want to delete this page?',
    loading: false,
    onOk: async (_, { close }) => {
      if (!editPage.value) return
      await pageStore.deletePage(editPage.value.id)
      close()
    },
  })
  alertModal.open()
}
</script>

<template>
  <div ref="imageDropZoneRef" class="flex-1 w-full overflow-hidden relative">
    <div v-if="isOverDropZone" class="absolute inset-0 bg-gray-50/80 z-10" />
    <div
      v-if="pageList.length === 0"
      class="size-full flex items-center justify-center"
    >
      <div
        class="w-[80%] aspect-square border-2 border-dashed border-gray-200 p-4 flex flex-col gap-2 items-center justify-center text-center"
        @click="showCreatePageModal"
      >
        <UIcon name="i-lucide:image-plus" size="32" />
        Drop Image here to create new page
      </div>
    </div>

    <div v-else class="flex flex-col size-full overflow-hidden">
      <div
        class="flex items-center justify-center gap-2 p-2 cursor-pointer border-2 border-dashed border-gray-200 hover:bg-gray-100 rounded-md mt-2 mb-1 mx-2"
        @click="showCreatePageModal"
      >
        <UIcon name="i-lucide:file-plus" size="24" />
        <p>Add new page</p>
      </div>
      <ul class="flex-1 overflow-y-auto overflow-x-hidden px-2 py-2">
        <UPopover
          v-for="page in pageList"
          :key="page.id"
          mode="hover"
          :modal="true"
          :open-delay="0"
          :content="{
            side: 'right',
            align: 'start',
            sideOffset: 16,
            hideWhenDetached: true,
          }"
        >
          <template #default>
            <li
              :class="[
                'relative',
                'flex items-center p-2 cursor-pointer hover:bg-gray-100 rounded-md mb-3 overflow-hidden',
                page.id !== pageStore.curPage.id &&
                  'hover:border-green-400 hover:text-green-600',
              ]"
              @click="() => onPageClick(page)"
            >
              <GlowBorder
                v-if="page.id === pageStore.curPage.id"
                class="rounded-md"
                :color="['#A07CFE', '#FE8FB5', '#FFBE7B']"
                :style="{
                  '--border-radius': 'calc(var(--ui-radius) * 1.5)',
                }"
              />
              <div class="flex flex-col gap-1 flex-1">
                <p class="font-bold">
                  {{ page.name }}
                </p>
                <p class="text-xs color-secondary">
                  Last Updated:
                  {{ $dayjs(page.updatedAt).format('YYYY-MM-DD HH:mm:ss') }}
                </p>
              </div>
              <UDropdownMenu
                :items="pageMenuItems"
                :content="{
                  align: 'start',
                  side: 'bottom',
                }"
                :ui="{
                  content: 'w-48',
                }"
              >
                <template #default="{ open }">
                  <div
                    :class="[
                      'flex items-center justify-center p-1 text-gray-500 hover:text-black',
                      open && 'text-black',
                    ]"
                    @click.stop="() => (editPage = page)"
                  >
                    <UIcon name="i-lucide:ellipsis-vertical" :size="16" />
                  </div>
                </template>
              </UDropdownMenu>
            </li>
          </template>
          <template #content>
            <div class="flex flex-col gap-2 p-2">
              <p class="font-bold text-sm">Preview:</p>
              <img v-qiniu="page.image" class="w-[17.5rem] object-scale-down" />
            </div>
          </template>
        </UPopover>
      </ul>
    </div>
  </div>
</template>
