<script setup lang="ts">
import type { DropdownMenuItem } from '@nuxt/ui'
import type { IProject } from '~/types/interfaces'
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
const pageModal = overlay.create(PageModal, {
  props: {
    mode: 'create',
    file: imageFileData.value,
    onSave: async () => {
      // await createPage(p)
    },
    onClose: () => {
      imageFileData.value = undefined
    },
    onDelete: () => {
      imageFileData.value = undefined
    },
  },
})

async function showCreatePageModal() {
  pageModal.patch({
    file: imageFileData.value,
  })
  pageModal.open()
}
</script>

<template>
  <div class="relative w-[18.75rem] shrink-0 bg-gray-50 shadow">
    <div class="h-full flex flex-col">
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
      <div
        ref="imageDropZoneRef"
        class="flex-1 w-full overflow-hidden relative"
      >
        <div
          v-if="isOverDropZone"
          class="absolute inset-0 bg-gray-50/80 z-10"
        />
        <div
          v-if="curProject.pages.length === 0"
          class="size-full flex items-center justify-center"
        >
          <div
            class="w-[80%] aspect-square border-2 border-dashed border-gray-200 p-4 flex flex-col gap-2 items-center justify-center text-center"
            @click="showCreatePageModal"
          >
            <UIcon name="i-lucide:upload" size="32" />
            Drop Image here to create new page
          </div>
        </div>
        <ul v-else class="size-full overflow-y-auto overflow-x-hidden px-2">
          <li v-for="page in pageList" :key="page.id" class="py-2">
            {{ page.name }}
          </li>
        </ul>
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
            class="flex flex-col gap-1 p-2 cursor-pointer hover:bg-gray-100 hover:text-green-400"
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
