<script setup lang="ts">
import { TeamRole } from '#shared/constants'

const projectStore = useProjectStore()
const {
  curProject,
  curTeam,
  teams,
  curReleases,
  curTeamProjects,
  curReleaseFilter,
} = storeToRefs(projectStore)
const { open: openCreateProject } = useCreateProjectModal()
const { openSettings, openExport } = useProjectActions()

/** Sentinel for the dropdown's action row, which must not change the filter. */
const MANAGE_RELEASES = 'manage'

const teamItems = computed(() =>
  teams.value.map((t) => ({
    label: t.name,
    value: t.id,
  }))
)

const canCreate = computed(() => canCreateProject(curTeam.value))
const canSettings = computed(() => canManageProjectSettings(curProject.value))

/**
 * Shown once labels exist, and always for a steward — they are the one who can
 * create the first one, so hiding the dropdown from them would hide the only
 * route to it from here.
 */
const showReleaseFilter = computed(
  () => curReleases.value.length > 0 || canSettings.value
)

const releaseItems = computed(() => [
  { label: 'All releases', value: 'all' },
  ...curReleases.value.map((release) => ({
    label: release.name,
    value: Number(release.id),
  })),
  { label: 'Unassigned', value: 'unassigned' },
  ...(canSettings.value
    ? [{ label: 'Manage releases…', value: MANAGE_RELEASES }]
    : []),
])

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

function onReleaseChange(value: string | number) {
  if (value === MANAGE_RELEASES) {
    openSettings(undefined, 'releases')
    return
  }
  projectStore.setReleaseFilter(value as ReleaseFilterValue)
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
    <TeamOwnerBadge
      :visible="curTeam?.role === TeamRole.OWNER"
      compact
    />
    <div class="min-w-0 flex-1 flex items-center gap-1 overflow-hidden">
      <div
        class="min-w-0 flex-1 flex items-center gap-1 overflow-x-auto"
      >
        <button
          v-for="project in curTeamProjects"
          :key="project.id"
          type="button"
          class="shrink-0 max-w-56 inline-flex items-center gap-1 rounded-md px-2.5 py-1 text-sm transition-colors"
          :class="
            isCurrent(project)
              ? 'bg-elevated font-medium text-highlighted'
              : 'text-muted hover:text-highlighted hover:bg-elevated/60'
          "
          @click="selectProject(project)"
        >
          <span class="min-w-0 truncate">{{ project.name }}</span>
          <ProjectOwnerBadge
            :project="project"
            :visible="Boolean(project.isSteward)"
            compact
          />
        </button>
        <p
          v-if="curTeamProjects.length === 0"
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
    <USelect
      v-if="showReleaseFilter"
      class="w-36 shrink-0"
      size="sm"
      :model-value="curReleaseFilter"
      :items="releaseItems"
      :disabled="!validID(curProject.id)"
      @update:model-value="onReleaseChange"
    />
    <div class="flex items-center gap-2 shrink-0">
      <UButton
        color="neutral"
        variant="outline"
        size="sm"
        icon="i-tabler:package-export"
        label="Export"
        :disabled="!validID(curProject.id)"
        @click="openExport()"
      />
      <UButton
        v-if="canSettings"
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
