<script setup lang="ts">
definePageMeta({
  middleware: ['protected'],
  ssr: false,
})

/**
 * The public API surface, for anyone who consumes it rather than stewards the
 * project. Documentation and examples are visible to every team member; issuing
 * a token is project configuration, so it sits behind a steward-only slideover —
 * `canManageProjectSettings`, the same gate the Releases roster uses.
 */

const toast = useToast()

const store = useProjectStore()
const { curProject, curReleases } = storeToRefs(store)

const projectId = computed(() => curProject.value?.id)
const canManage = computed(() => canManageProjectSettings(curProject.value))

const baseUrl = computed(() =>
  typeof window === 'undefined' ? '' : window.location.origin
)

const releaseExample = computed(() => curReleases.value[0]?.name ?? 'v1')

function curlExample(path: string) {
  return `curl -H "Authorization: Bearer <token>" \\
  ${baseUrl.value}${path}`
}

const examples = computed(() => [
  {
    title: 'Project metadata',
    description:
      'Locales, fallback, the releases you can filter by, and how many keys are published per locale.',
    code: curlExample(`/api/v1/projects/${projectId.value ?? ':id'}/meta`),
  },
  {
    title: 'One locale',
    description:
      'Flat { key: text } map of published copy. Missing keys stay missing on purpose.',
    code: curlExample(
      `/api/v1/projects/${projectId.value ?? ':id'}/locales/en`
    ),
  },
  {
    title: 'Filtered to a release',
    description:
      'Narrow to the keys labelled with one release. Accepts the id or the name.',
    code: curlExample(
      `/api/v1/projects/${projectId.value ?? ':id'}/locales/en?release=${releaseExample.value}`
    ),
  },
  {
    title: 'Every locale in one bundle',
    description:
      'All locales in a single round trip. Same shape, keyed by locale.',
    code: curlExample(`/api/v1/projects/${projectId.value ?? ':id'}/bundle`),
  },
])

const fetchExample = computed(
  () => `const res = await fetch(
  '${baseUrl.value}/api/v1/projects/${projectId.value ?? ':id'}/locales/en',
  { headers: { Authorization: 'Bearer ' + process.env.LOCALNESS_API_TOKEN } }
)
const messages = await res.json()`
)

async function copy(value: string, label: string) {
  try {
    await navigator.clipboard.writeText(value)
    toast.add({ title: `${label} copied`, color: 'success' })
  } catch {
    toast.add({ title: 'Copy failed', color: 'error' })
  }
}
</script>

<template>
  <div class="size-full overflow-auto">
    <div class="mx-auto max-w-3xl p-6 flex flex-col gap-8">
      <header class="flex flex-col gap-2">
        <h1 class="text-xl font-semibold">API</h1>
        <p class="text-sm text-muted">
          Read-only access to this project's published copy. Drafts are never
          reachable with a token, and versioned by
          <code class="text-xs">release</code> only.
        </p>
      </header>

      <ApiTokensSlideover
        v-if="canManage"
        :project-id="projectId"
      />

      <section class="flex flex-col gap-3">
        <h2 class="text-sm font-semibold">Authentication</h2>
        <div
          class="rounded-lg border border-default p-3 flex flex-col gap-2 text-sm"
        >
          <p class="text-muted">
            Send a token as a bearer credential. A token names exactly one
            project, so it cannot read any other.
          </p>
          <p
            v-if="!canManage"
            class="text-xs text-muted"
          >
            No token yet? Ask a project steward to issue one for this project.
          </p>
          <pre
            class="rounded bg-elevated/50 p-2 text-xs overflow-x-auto"
          ><code>Authorization: Bearer &lt;token&gt;</code></pre>
          <p class="text-xs text-muted">
            Requests need HTTPS in front of the instance — a token over plain
            HTTP is a credential on the wire.
          </p>
        </div>
      </section>

      <section class="flex flex-col gap-3">
        <h2 class="text-sm font-semibold">Endpoints</h2>
        <div
          v-for="example in examples"
          :key="example.title"
          class="rounded-lg border border-default p-3 flex flex-col gap-2"
        >
          <div class="flex items-start justify-between gap-2">
            <div class="flex flex-col gap-0.5 min-w-0">
              <span class="text-sm font-medium">{{ example.title }}</span>
              <span class="text-xs text-muted">{{ example.description }}</span>
            </div>
            <UButton
              size="xs"
              color="neutral"
              variant="ghost"
              icon="i-lucide:copy"
              @click="copy(example.code, example.title)"
            />
          </div>
          <pre
            class="rounded bg-elevated/50 p-2 text-xs overflow-x-auto"
          ><code>{{ example.code }}</code></pre>
        </div>
      </section>

      <section class="flex flex-col gap-3">
        <div class="flex items-center justify-between">
          <h2 class="text-sm font-semibold">From the browser or Node</h2>
          <UButton
            size="xs"
            color="neutral"
            variant="ghost"
            icon="i-lucide:copy"
            @click="copy(fetchExample, 'Snippet')"
          />
        </div>
        <pre
          class="rounded-lg border border-default bg-elevated/50 p-3 text-xs overflow-x-auto"
        ><code>{{ fetchExample }}</code></pre>
      </section>
    </div>
  </div>
</template>
