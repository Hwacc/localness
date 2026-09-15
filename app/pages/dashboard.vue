<script setup lang="ts">
import { TeamRole } from '#shared/constants'

definePageMeta({
  middleware: ['protected'],
  ssr: false,
})

const { $dayjs } = useNuxtApp()
const { loggedIn, user: sessionUser } = useUserSession()
const projectStore = useProjectStore()
const { teams, projects, projectsByTeam, curProject } =
  storeToRefs(projectStore)
const { open: openCreateProject } = useCreateProjectModal()
const { openSettings, openExport } = useProjectActions()

const loading = ref(false)

const { joinCode, joining, joinWithCode } = useJoinTeamByCode(async (team) => {
  await projectStore.getProjects()
  projectStore.setCurrentTeam(team.id)
  joinPromptOpen.value = false
})

const toast = useToast()
const route = useRoute()
const joinPromptOpen = ref(false)

function joinPromptStorageKey() {
  return `localness:join-team-prompt:${sessionUser.value?.id ?? ''}`
}

function skipJoinPrompt() {
  if (import.meta.client && sessionUser.value?.id) {
    sessionStorage.setItem(joinPromptStorageKey(), '1')
  }
}

async function onJoinedFromPrompt(team: ITeam) {
  skipJoinPrompt()
  await projectStore.getProjects()
  projectStore.setCurrentTeam(team.id)
}

function maybeOpenJoinPrompt() {
  if (loading.value || teams.value.length > 0) return
  if (!sessionUser.value?.id) return
  if (!import.meta.client) return
  if (sessionStorage.getItem(joinPromptStorageKey())) return
  joinPromptOpen.value = true
}

onMounted(async () => {
  if (!loggedIn.value) return
  loading.value = true
  try {
    await projectStore.getProjects()
  } finally {
    loading.value = false
  }
  maybeOpenJoinPrompt()

  const code = route.query.oauth_error
  if (typeof code === 'string' && code) {
    const copy: Record<string, string> = {
      atlassian: 'Atlassian sign-in failed. Try again.',
      domain: 'That Atlassian email is not allowed.',
      already_bound: 'This account already has an Atlassian login.',
      identity_taken: 'That Atlassian account is linked to another user.',
    }
    toast.add({
      title: 'Atlassian',
      description: copy[code] ?? copy.atlassian,
      color: 'error',
      icon: 'i-lucide:circle-alert',
    })
  }
  if (route.query.oauth === 'bound') {
    toast.add({
      title: 'Atlassian connected',
      color: 'success',
      icon: 'i-lucide:circle-check',
    })
  }
  if (route.query.oauth_error || route.query.oauth) {
    const nextQuery = { ...route.query }
    delete nextQuery.oauth_error
    delete nextQuery.oauth
    await navigateTo(
      { path: '/dashboard', query: { ...nextQuery } },
      { replace: true }
    )
  }
})
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
</script>

<template>
  <div class="h-full min-w-0 overflow-auto bg-muted">
    <header
      class="shrink-0 px-6 py-5 bg-default border-b border-default"
    >
      <h1 class="text-xl font-semibold tracking-tight">Dashboard</h1>
      <p class="mt-1 text-sm text-muted">
        Your teams and projects. Open Editor or Translations from a card.
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
          <p class="mt-1 text-lg font-semibold truncate min-w-0">
            {{ validID(curProject.id) ? curProject.name : '—' }}
          </p>
          <ProjectOwnerBadge
            class="mt-1"
            :project="curProject"
            :visible="Boolean(curProject.isSteward)"
          />
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
            class="min-w-0 max-w-full"
            @click="selectProject(project)"
          >
            <span class="min-w-0 truncate">{{ project.name }}</span>
            <ProjectOwnerBadge
              :project="project"
              :visible="Boolean(project.isSteward)"
              compact
            />
          </UButton>
        </div>
      </div>

      <div
        v-if="!loading && teams.length === 0"
        class="rounded-xl border border-default bg-default px-6 py-12 text-center"
      >
        <p class="text-sm text-muted">
          You are not in a team yet. Join with an invite code, or ask an Admin
          to create one.
        </p>
        <form
          class="mt-4 flex justify-center items-center gap-2"
          @submit.prevent="joinWithCode"
        >
          <UInput
            v-model="joinCode"
            class="w-56"
            placeholder="Invite code"
          />
          <UButton
            type="submit"
            label="Join team"
            icon="i-lucide:log-in"
            :loading="joining"
            :disabled="!joinCode.trim()"
          />
        </form>
      </div>

      <section
        v-for="{ team, projects: teamProjects } in projectsByTeam"
        :key="team.id"
        class="flex flex-col gap-3"
      >
        <div class="flex items-center gap-2">
          <h2 class="text-sm font-semibold truncate">{{ team.name }}</h2>
          <TeamOwnerBadge :visible="team.role === TeamRole.OWNER" />
          <TeamMemberBadge :visible="team.role === TeamRole.MEMBER" />
          <span class="ml-auto" />
          <UButton
            v-if="canCreateProject(team)"
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
            <div class="flex items-start gap-2 min-w-0">
              <p class="font-medium truncate min-w-0 flex-1">{{ project.name }}</p>
              <ProjectOwnerBadge
                :project="project"
                :visible="Boolean(project.isSteward)"
              />
            </div>
            <p class="mt-1 text-xs text-muted line-clamp-2">
              {{ project.description || 'No description' }}
            </p>
            <p class="mt-3 text-xs text-muted">
              {{ project.pages?.length ?? 0 }} pages
              <span v-if="project.updatedAt">
                · {{ $dayjs(project.updatedAt).format('YYYY-MM-DD HH:mm') }}
              </span>
            </p>
            <div class="mt-3 flex flex-wrap gap-2" @click.stop>
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
              <UButton
                size="xs"
                color="neutral"
                variant="ghost"
                icon="i-tabler:package-export"
                @click="openExport(project)"
              />
              <UButton
                v-if="canManageProjectSettings(project)"
                size="xs"
                color="neutral"
                variant="ghost"
                icon="i-lucide:settings-2"
                @click="openSettings(project)"
              />
            </div>
          </button>
        </div>
      </section>
    </div>
    <JoinTeamDialog
      v-model:open="joinPromptOpen"
      @skip="skipJoinPrompt"
      @joined="onJoinedFromPrompt"
    />
  </div>
</template>
