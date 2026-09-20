<script setup lang="ts">
import { copyTextToClipboard } from '~/utils/clipboard'

definePageMeta({
  middleware: ['protected'],
  ssr: false,
})

/**
 * The public API surface, for anyone who consumes it rather than stewards the
 * project. Documentation is visible to every Team Member, and so is the token
 * slideover — a member may mint their own credential.
 */

const toast = useToast()

const store = useProjectStore()
const { curProject, curReleases } = storeToRefs(store)

const projectId = computed(() => curProject.value?.id)

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
      'Locales, fallback, the releases you can filter by, and how many keys are published per locale. A consumer that holds nothing but a token starts here — this is where it learns which project it serves.',
    code: curlExample('/api/v1/meta'),
  },
  {
    title: 'One locale',
    description:
      'Flat { key: text } map of published copy. Missing keys stay missing on purpose.',
    code: curlExample('/api/v1/locales/en'),
  },
  {
    title: 'Filtered to a release',
    description:
      'Narrow to the keys labelled with one release. Accepts the id or the name.',
    code: curlExample(`/api/v1/locales/en?release=${releaseExample.value}`),
  },
  {
    title: 'Every locale in one bundle',
    description:
      'All locales in a single round trip. Same shape, keyed by locale.',
    code: curlExample('/api/v1/bundle'),
  },
])

const fetchExample = computed(
  () => `const res = await fetch(
  '${baseUrl.value}/api/v1/locales/en',
  { headers: { Authorization: 'Bearer ' + process.env.LOCALNESS_API_TOKEN } }
)
const messages = await res.json()`
)

/** Same token, same copy, spoken as MCP so an agent can read it directly. */
const mcpConfig = computed(
  () => `{
  "mcpServers": {
    "localness": {
      "url": "${baseUrl.value}/mcp",
      "headers": { "Authorization": "Bearer <token>" }
    }
  }
}`
)

async function copy(value: string, label: string) {
  try {
    await copyTextToClipboard(value)
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

      <ApiTokensSlideover :project-id="projectId" />

      <section class="flex flex-col gap-3">
        <h2 class="text-sm font-semibold">Authentication</h2>
        <div
          class="rounded-lg border border-default p-3 flex flex-col gap-2 text-sm"
        >
          <p class="text-muted">
            Send a token as a bearer credential. The token picks the project and
            the URL names none, so a consumer holding nothing but a token can
            start at <code class="text-xs">/meta</code> to learn what it serves.
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

      <section class="flex flex-col gap-3">
        <div class="flex items-center justify-between">
          <h2 class="text-sm font-semibold">MCP</h2>
          <UButton
            size="xs"
            color="neutral"
            variant="ghost"
            icon="i-lucide:copy"
            @click="copy(mcpConfig, 'Config')"
          />
        </div>
        <p class="text-sm text-muted">
          An agent can read the same published copy over MCP instead of you
          writing a client. It takes the same token and sits on the same
          endpoints, exposed as
          <code class="text-xs">get_project_info</code>,
          <code class="text-xs">get_translations</code>,
          <code class="text-xs">get_all_translations</code>,
          <code class="text-xs">get_translation</code>,
          <code class="text-xs">get_key</code>,
          <code class="text-xs">list_keys</code>,
          <code class="text-xs">list_unpublished_keys</code>,
          <code class="text-xs">search_keys</code>
          and
          <code class="text-xs">search_by_text</code>. None of them takes a project —
          the token already says which one. Every tool except the first can also
          be narrowed to a single release, the same way
          <code class="text-xs">?release=</code> does above. Omit release when
          proofreading a product locale folder against the full catalog.
        </p>
        <pre
          class="rounded-lg border border-default bg-elevated/50 p-3 text-xs overflow-x-auto"
        ><code>{{ mcpConfig }}</code></pre>
      </section>
    </div>
  </div>
</template>
