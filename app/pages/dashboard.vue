<script setup lang="ts">
import { TeamRole } from '#shared/constants'

definePageMeta({
  middleware: ['protected'],
  ssr: false,
})

const { $dayjs } = useNuxtApp()
const { loggedIn } = useUserSession()
const projectStore = useProjectStore()
const { teams, projects, projectsByTeam, curProject } =
  storeToRefs(projectStore)
const { open: openCreateProject } = useCreateProjectModal()

const loading = ref(false)

const pageCount = computed(() =>
  projects.value.reduce((sum, p) => sum + (p.pages?.length ?? 0), 0)
)

const recentProjects = computed(() => projects.value.slice(0, 3))

function isCurrent(project: IProject) {
  return String(project.id) === String(curProject.value.id)
}

function selectProject(project: IProject) {
  projectStore.setCurrentProject(project)
}

onMounted(async () => {
  if (!loggedIn.value) return
  loading.value = true
  try {
    await projectStore.getProjects()
  } finally {
    loading.value = false
  }
})
</script>

<template>
  <div class="h-full min-w-0 overflow-auto bg-muted">
    <header
      class="shrink-0 px-6 py-5 bg-default border-b border-default"
    >
      <h1 class="text-xl font-semibold tracking-tight">Dashboard</h1>
      <p class="mt-1 text-sm text-muted">
        Your teams and projects. Switch here or from the sidebar.
      </p>
    </header>

    <div class="p-6 flex flex-col gap-6">
      <div class="grid grid-cols-2 md:grid-cols-4 gap-3">
        <div class="rounded-xl border border-default bg-default px-4 py-3">
          <p class="text-xs text-muted">Teams</p>
          <p class="mt-1 text-2xl font-semibold">{{ teams.length }}</p>
        </div>
        <div class="rounded-xl border border-default bg-default px-4 py-3">
          <p class="text-xs text-muted">Projects</p>
          <p class="mt-1 text-2xl font-semibold">{{ projects.length }}</p>
        </div>
        <div class="rounded-xl border border-default bg-default px-4 py-3">
          <p class="text-xs text-muted">Pages</p>
          <p class="mt-1 text-2xl font-semibold">{{ pageCount }}</p>
        </div>
        <div class="rounded-xl border border-default bg-default px-4 py-3">
          <p class="text-xs text-muted">Current project</p>
          <p class="mt-1 text-lg font-semibold truncate">
            {{ validID(curProject.id) ? curProject.name : '—' }}
          </p>
        </div>
      </div>

      <div
        v-if="recentProjects.length"
        class="rounded-xl border border-default bg-default px-4 py-3"
      >
        <p class="text-xs font-medium text-muted uppercase tracking-wide">
          Recently updated
        </p>
        <div class="mt-2 flex flex-wrap gap-2">
          <UButton
            v-for="project in recentProjects"
            :key="project.id"
            color="neutral"
            variant="outline"
            size="sm"
            :label="project.name"
            @click="selectProject(project)"
          />
        </div>
      </div>

      <div
        v-if="!loading && teams.length === 0"
        class="rounded-xl border border-default bg-default px-6 py-12 text-center text-sm text-muted"
      >
        You are not in a team yet. Ask an ADMIN to create one and invite you.
      </div>

      <section
        v-for="{ team, projects: teamProjects } in projectsByTeam"
        :key="team.id"
        class="flex flex-col gap-3"
      >
        <div class="flex items-center gap-2">
          <h2 class="text-sm font-semibold truncate">{{ team.name }}</h2>
          <UBadge color="neutral" variant="subtle" size="sm">
            {{ team.role || 'MEMBER' }}
          </UBadge>
          <span class="ml-auto" />
          <UButton
            v-if="team.role === TeamRole.OWNER"
            size="sm"
            color="neutral"
            variant="outline"
            icon="i-lucide:plus"
            label="New Project"
            @click="openCreateProject(team.id)"
          />
        </div>
        <div
          v-if="teamProjects.length === 0"
          class="rounded-xl border border-dashed border-default bg-default px-4 py-8 text-sm text-muted"
        >
          No projects in this team.
          <span v-if="team.role !== TeamRole.OWNER">
            Ask a Team OWNER to create one.
          </span>
        </div>
        <div
          v-else
          class="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3"
        >
          <button
            v-for="project in teamProjects"
            :key="project.id"
            type="button"
            class="text-left rounded-xl border bg-default p-4 transition-colors"
            :class="
              isCurrent(project)
                ? 'border-primary'
                : 'border-default hover:border-muted'
            "
            @click="selectProject(project)"
          >
            <p class="font-medium truncate">{{ project.name }}</p>
            <p class="mt-1 text-xs text-muted line-clamp-2">
              {{ project.description || 'No description' }}
            </p>
            <p class="mt-3 text-xs text-muted">
              {{ project.pages?.length ?? 0 }} pages
              <span v-if="project.updatedAt">
                · {{ $dayjs(project.updatedAt).format('YYYY-MM-DD HH:mm') }}
              </span>
            </p>
            <div class="mt-3 flex gap-2" @click.stop>
              <UButton
                size="xs"
                color="neutral"
                variant="outline"
                label="Editor"
                @click="
                  () => {
                    selectProject(project)
                    navigateTo('/editor')
                  }
                "
              />
              <UButton
                size="xs"
                color="neutral"
                variant="outline"
                label="Translations"
                @click="
                  () => {
                    selectProject(project)
                    navigateTo('/translations')
                  }
                "
              />
            </div>
          </button>
        </div>
      </section>
    </div>
  </div>
</template>
