<script setup lang="ts">
import { ProjectModal } from '#components'
import type { DropdownMenuItem } from '@nuxt/ui'
import { injectProjectContext } from '~/context/ProjectProvider.vue'
import type { IProject } from '~/types/interfaces'

const { curProject } = injectProjectContext()

const isShowEditProjectName = ref<boolean>(false)
const editProjectName = ref<string>(curProject.value?.name ?? '')
const editProjectNameInput = ref<{ inputRef: HTMLInputElement }>()

const isShowSelectProject = ref<boolean>(false)

const newProjectOverlay = useOverlay()

const projectMenuItems: DropdownMenuItem[] = [
  {
    label: 'New Project',
    icon: 'i-lucide:folder-plus',
    onSelect: () => {
      newProjectOverlay
        .create(ProjectModal, {
          props: {
            onSave: (p: IProject) => {
              console.log(p)
              //TODO: save new project
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
    label: 'Rename',
    icon: 'i-lucide:folder-pen',
    onSelect: () => {
      // after dropdown menu animate end
      setTimeout(() => {
        isShowEditProjectName.value = true
        nextTick(() => {
          editProjectNameInput.value?.inputRef.focus()
        })
      }, 200)
    },
  },
]

const handleBlur = () => {
  if (editProjectName.value) {
    const _name = editProjectName.value.trim()
    curProject.value.name = _name ? _name : curProject.value.name
    //TODO: save project name
  }
  isShowEditProjectName.value = false
}

const handleSelectProject = (id: string) => {
  //TODO: load project
  console.log(id)
  isShowSelectProject.value = false
}
</script>

<template>
  <div class="relative w-[18.75rem] shrink-0 bg-gray-50 shadow">
    <div class="h-full flex flex-col">
      <div class="flex items-center justify-between py-4 px-2 gap-2 shadow">
        <div class="flex-1 overflow-hidden">
          <div v-if="!isShowEditProjectName" class="text-base font-bold">
            {{ curProject.name }}
          </div>
          <UInput
            v-else
            ref="editProjectNameInput"
            v-model="editProjectName"
            placeholder="Project Name"
            @blur="handleBlur"
          />
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
            class="p-2 cursor-pointer hover:bg-gray-100 hover:text-green-400"
            @click="handleSelectProject('')"
          >
            Project Name
          </li>
        </ul>
      </div>
    </div>
  </div>
</template>
