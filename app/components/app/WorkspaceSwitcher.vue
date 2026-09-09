<script setup lang="ts">
import { TeamRole } from '#shared/constants'

const projectStore = useProjectStore()
const { curProject, curTeam, projectsByTeam } = storeToRefs(projectStore)
const { open: openCreateProject } = useCreateProjectModal()

const search = ref('')
const open = ref(false)

const grouped = computed(() => {
  const q = search.value.trim().toLowerCase()
  return projectsByTeam.value
    .map(({ team, projects }) => ({
      team,
      projects: q
        ? projects.filter((p) => p.name.toLowerCase().includes(q))
        : projects,
    }))
    .filter(
      ({ team, projects }) =>
        !q ||
        team.name.toLowerCase().includes(q) ||
        projects.length > 0
    )
})

const triggerLabel = computed(() => {
  if (validID(curProject.value.id)) return curProject.value.name
  if (curTeam.value) return curTeam.value.name
  return 'Workspace'
})

const triggerInitial = computed(() => {
  const name = curProject.value.name || curTeam.value?.name || 'W'
  return name.slice(0, 1).toUpperCase()
})

function isCurrent(project: IProject) {
  return String(project.id) === String(curProject.value.id)
}

function selectProject(project: IProject) {
  projectStore.setCurrentProject(project)
  open.value = false
}

function onCreate(teamId: ID) {
  open.value = false
  openCreateProject(teamId)
}
</script>

<template>
  <UPopover
    v-model:open="open"
    :content="{ side: 'right', align: 'end', sideOffset: 8 }"
    :ui="{ content: 'w-80 p-0' }"
  >
    <UTooltip :text="triggerLabel" :content="{ side: 'right' }">
      <button
        type="button"
        class="size-8 rounded-md bg-elevated text-xs font-semibold text-highlighted flex items-center justify-center outline-none hover:bg-muted focus-visible:ring-2 focus-visible:ring-primary"
      >
        {{ triggerInitial }}
      </button>
    </UTooltip>
    <template #content>
      <div class="p-3 border-b border-default">
        <p class="text-xs text-muted">Current team</p>
        <p class="font-medium truncate">
          {{ curTeam?.name || 'No team' }}
          <span v-if="curTeam?.role" class="text-xs text-muted font-normal">
            · {{ curTeam.role }}
          </span>
        </p>
        <p class="mt-2 text-xs text-muted">Current project</p>
        <p class="font-medium truncate">
          {{ validID(curProject.id) ? curProject.name : 'No project' }}
        </p>
      </div>
      <div class="p-3 border-b border-default">
        <UInput
          v-model="search"
          icon="i-lucide:search"
          placeholder="Search projects"
          size="sm"
        />
      </div>
      <div class="max-h-72 overflow-auto p-2">
        <div
          v-if="grouped.length === 0"
          class="px-2 py-6 text-sm text-muted text-center"
        >
          No teams yet.
        </div>
        <div v-for="{ team, projects } in grouped" :key="team.id" class="mb-2">
          <div class="flex items-center gap-2 px-2 py-1.5">
            <p class="min-w-0 flex-1 text-xs font-medium text-muted uppercase tracking-wide truncate">
              {{ team.name }}
            </p>
            <UButton
              v-if="team.role === TeamRole.OWNER"
              size="xs"
              color="neutral"
              variant="ghost"
              icon="i-lucide:plus"
              label="New"
              @click="onCreate(team.id)"
            />
          </div>
          <button
            v-for="project in projects"
            :key="project.id"
            type="button"
            class="w-full text-left rounded-md px-2 py-1.5 mb-0.5"
            :class="
              isCurrent(project)
                ? 'bg-primary/10 text-highlighted'
                : 'hover:bg-elevated'
            "
            @click="selectProject(project)"
          >
            <p class="text-sm font-medium truncate">{{ project.name }}</p>
            <p class="text-xs text-muted">
              {{ project.pages?.length ?? 0 }} pages
            </p>
          </button>
          <p
            v-if="projects.length === 0"
            class="px-2 py-1 text-xs text-muted"
          >
            No projects
          </p>
        </div>
      </div>
      <div class="p-2 border-t border-default">
        <UButton
          color="neutral"
          variant="ghost"
          block
          class="justify-start"
          icon="i-lucide:users"
          label="Manage Teams"
          @click="
            () => {
              open = false
              navigateTo('/teams')
            }
          "
        />
      </div>
    </template>
  </UPopover>
</template>
