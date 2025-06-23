<script setup lang="ts">
import type { DropdownMenuItem } from '@nuxt/ui'
import type { IPage, IProject } from '~/types/interfaces'
import { useDropZone } from '@vueuse/core'
import { isEmpty } from 'lodash-es'
import { PageModal, ProjectModal } from '#components'
import type { ProjectStore } from '~/stores/project'

const projectStore = useProjectStore()
const { projects, curProject, pageList } =
  storeToRefs<ProjectStore>(projectStore)
const { getProjects, createProject, updateProject, setCurrentProject } =
  projectStore

await getProjects()

const { $dayjs } = useNuxtApp()
const overlay = useOverlay()

const showProjectSheet = ref<boolean>(false)
const projectModal = overlay.create(ProjectModal, {
  props: {
    mode: 'create',
    onSave: () => {},
  },
})
const projectMenuItems: DropdownMenuItem[] = [
  {
    label: 'New Project',
    icon: 'i-lucide:folder-plus',
    onSelect: () => {
      projectModal.patch({
        mode: 'create',
        onSave: async (p, { close }) => {
          await createProject(p)
          close()
        },
      })
      projectModal.open()
    },
  },
  {
    label: 'Open Project',
    icon: 'i-lucide:folder-open',
    onSelect: () => {
      showProjectSheet.value = true
    },
  },
  {
    label: 'Edit Project',
    icon: 'i-lucide:folder-pen',
    onSelect: () => {
      projectModal.patch({
        mode: 'edit',
        project: curProject.value,
        onSave: async (p, { close }) => {
          await updateProject(curProject.value.id, p)
          close()
        },
      })
      projectModal.open()
    },
  },
]

function onSelectProject(p: IProject) {
  setCurrentProject(p)
  showProjectSheet.value = false
}

const pageStore = usePageStore()
const { curPage } = storeToRefs(pageStore)
const editPage = ref<IPage | undefined>(undefined)
const pageMenuItems: DropdownMenuItem[] = [
  {
    label: 'Edit Page',
    icon: 'i-lucide:file-pen',
    onSelect: showEditPageModal,
  },
  {
    label: 'Delete Page',
    icon: 'i-lucide:trash-2',
    onSelect: async () => {
      if(!editPage.value) return
      await pageStore.deletePage(editPage.value.id)
    },
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
function onPageClick(page: IPage) {
  pageStore.setCurrentPage(page)
}

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

</script>

<template>
  <div class="relative w-[18.75rem] shrink-0 bg-gray-50 shadow">
    <div class="h-full flex flex-col">
      <!-- Project Header -->
      <div class="flex items-center justify-between py-4 px-2 gap-2 shadow">
        <div class="flex-1 text-base font-bold overflow-hidden">
          {{ curProject.name }}
        </div>
        <UDropdownMenu
          :items="projectMenuItems"
          :content="{
            align: 'start',
            side: 'bottom',
          }"
          :ui="{
            content: 'w-48',
          }"
        >
          <template #default="{ open }">
            <UButton
              :class="['hover:text-green-400', open && 'text-green-400']"
              icon="i-lucide-menu"
              color="neutral"
              variant="outline"
            />
          </template>
        </UDropdownMenu>
      </div>

      <!-- Page Area -->
      <div
        ref="imageDropZoneRef"
        class="flex-1 w-full overflow-hidden relative"
      >
        <div
          v-if="isOverDropZone"
          class="absolute inset-0 bg-gray-50/80 z-10"
        />
        <div
          v-if="curProject.pages?.length === 0"
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
                    page.id !== curPage.id &&
                      'hover:border-green-400 hover:text-green-600',
                  ]"
                  @click="() => onPageClick(page)"
                >
                  <GlowBorder
                    v-if="page.id === curPage.id"
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
                  <img
                    v-qiniu="page.image"
                    class="w-[17.5rem] object-scale-down"
                  />
                </div>
              </template>
            </UPopover>
          </ul>
        </div>
      </div>
      <div class="flex items-center py-4 px-2 gap-2 shadow">
        <p></p>
      </div>
    </div>

    <!-- Project Sheet -->
    <div
      :class="[
        'absolute inset-0 flex flex-col bg-gray-50 shadow transition-transform',
        showProjectSheet ? 'translate-x-0' : 'translate-x-[-100%]',
      ]"
    >
      <div class="flex items-center py-4 px-2 gap-4 shadow">
        <UIcon
          class="size-6"
          name="i-lucide:arrow-left"
          @click="showProjectSheet = false"
        />
        <p class="text-base font-bold">Select Project</p>
      </div>
      <div class="flex-1 flex flex-col gap-2 p-2 overflow-hidden">
        <!-- TODO: Search -->
        <UInput placeholder="Search" />
        <ul class="h-full flex-1 overflow-y-auto overflow-x-hidden">
          <li
            v-for="project in projects"
            :key="project.id"
            class="flex flex-col gap-1 p-2 cursor-pointer hover:bg-gray-100 hover:text-green-600"
            @click="onSelectProject(project)"
          >
            <p class="font-bold">
              {{ project.name }}
            </p>
            <p class="text-xs color-secondary">
              Last Updated:
              {{ $dayjs(project.updatedAt).format('YYYY-MM-DD HH:mm:ss') }}
            </p>
          </li>
        </ul>
      </div>
    </div>
  </div>
</template>
