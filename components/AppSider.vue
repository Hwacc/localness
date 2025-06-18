<script setup lang="ts">
import type { DropdownMenuItem } from '@nuxt/ui'
import { injectProjectContext } from '~/context/ProjectProvider.vue'
import type { IProject } from '~/types/interfaces'
import ProjectModal from '~/components/ProjectModal.vue'

const { projects, curProject, createProject, updateProject } =
  injectProjectContext()
const { $dayjs } = useNuxtApp()

const isShowSelectProject = ref<boolean>(false)

const projectOverlay = useOverlay()

const projectMenuItems: DropdownMenuItem[] = [
  {
    label: 'New Project',
    icon: 'i-lucide:folder-plus',
    onSelect: () => {
      projectOverlay
        .create(ProjectModal, {
          props: {
            mode: 'create',
            onSave: async (p) => {
              await createProject(p)
            },
          },
        })
        .open()
    },
  },
  {
    label: 'Open Project',
    icon: 'i-lucide:folder-open',
    onSelect: () => {
      isShowSelectProject.value = true
    },
  },
  {
    label: 'Edit Project',
    icon: 'i-lucide:folder-pen',
    onSelect: () => {
      projectOverlay
        .create(ProjectModal, {
          props: {
            mode: 'edit',
            project: curProject.value,
            onSave: async (p) => {
              await updateProject({ ...p, id: curProject.value.id })
            },
          },
        })
        .open()
    },
  },
]

function onSelectProject(p: IProject) {
  curProject.value = p
  isShowSelectProject.value = false
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
      <ul class="flex-1 overflow-y-auto overflow-x-hidden px-2">
        <li class="py-2">Item 1</li>
      </ul>
    </div>
    <div
      :class="[
        'absolute inset-0 flex flex-col bg-gray-50 shadow transition-transform',
        isShowSelectProject ? 'translate-x-0' : 'translate-x-[-100%]',
      ]"
    >
      <div class="flex items-center py-4 px-2 gap-4 shadow">
        <UIcon
          class="size-6"
          name="i-lucide:arrow-left"
          @click="isShowSelectProject = false"
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
