<script setup lang="ts">
import { TeamRole } from '#shared/constants'

const projectStore = useProjectStore()
const { curProject, curTeam, teams, projects } = storeToRefs(projectStore)
const { open: openCreateProject } = useCreateProjectModal()
const { openSettings, openExport } = useProjectActions()

const teamProjects = computed(() =>
  projects.value.filter(
    (p) =>
      String(p.teamId) === String(curTeam.value?.id ?? curProject.value.teamId)
  )
)

const teamItems = computed(() =>
  teams.value.map((t) => ({
    label: t.role ? `${t.name} · ${t.role}` : t.name,
    value: t.id,
  }))
)

const canCreate = computed(() => curTeam.value?.role === TeamRole.OWNER)

function isCurrent(project: IProject) {
  return String(project.id) === String(curProject.value.id)
}

function selectProject(project: IProject) {
  projectStore.setCurrentProject(project)
}

function onTeamChange(id: ID | undefined) {
  if (id == null) return
  projectStore.setCurrentTeam(id)
}
</script>

<template>
  <div
    class="shrink-0 h-12 px-3 border-b border-default bg-default flex items-center gap-3 min-w-0"
  >
    <USelect
      class="w-44 shrink-0"
      size="sm"
      placeholder="Team"
      :model-value="curTeam?.id"
      :items="teamItems"
      @update:model-value="onTeamChange"
    />
    <div class="min-w-0 flex-1 flex items-center gap-1 overflow-hidden">
      <div
        class="min-w-0 flex-1 flex items-center gap-1 overflow-x-auto"
      >
        <button
          v-for="project in teamProjects"
          :key="project.id"
          type="button"
          class="shrink-0 max-w-48 truncate rounded-md px-2.5 py-1 text-sm transition-colors"
          :class="
            isCurrent(project)
              ? 'bg-elevated font-medium text-highlighted'
              : 'text-muted hover:text-highlighted hover:bg-elevated/60'
          "
          @click="selectProject(project)"
        >
          {{ project.name }}
        </button>
        <p
          v-if="teamProjects.length === 0"
          class="px-2 text-sm text-muted truncate"
        >
          No project in this team
        </p>
      </div>
      <UButton
        v-if="canCreate"
        size="xs"
        color="neutral"
        variant="ghost"
        icon="i-lucide:plus"
        :disabled="!curTeam"
        @click="openCreateProject(curTeam?.id)"
      />
    </div>
    <div class="flex items-center gap-2 shrink-0">
      <UButton
        color="neutral"
        variant="ghost"
        size="sm"
        icon="i-tabler:package-export"
        label="Export"
        :disabled="!validID(curProject.id)"
        @click="openExport()"
      />
      <UButton
        color="neutral"
        variant="outline"
        size="sm"
        icon="i-lucide:settings"
        label="Project settings"
        :disabled="!validID(curProject.id)"
        @click="openSettings()"
      />
    </div>
  </div>
</template>
