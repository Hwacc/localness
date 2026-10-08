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
 *
 * Nothing here belongs to the selected project: a token is personal and names
 * its own projects, so this page reads no project state at all and the layout
 * hides the project switcher on it.
 */

const toast = useToast()

const baseUrl = computed(() =>
  typeof window === 'undefined' ? '' : window.location.origin
)

/**
 * A literal rather than a release name read from the current project. Release
 * names are per project, so borrowing one would put a name on the page that is
 * only correct for whichever project happened to be selected — and that the
 * reader cannot see, since this page shows no project.
 */
const RELEASE_EXAMPLE = 'v1'

function curlExample(path: string) {
  return `curl -H "Authorization: Bearer <token>" \\
  ${baseUrl.value}${path}`
}

const examples = computed(() => [
  {
    title: 'Which projects may this token reach?',
    description:
      'A token belongs to you and may name several projects, so this is where a consumer starts: it lists what the credential can address, filtered by your current team memberships. An empty list means the token is spent.',
    code: curlExample('/api/v1/projects'),
  },
  {
    title: 'Project metadata',
    description:
      'Locales, fallback, the releases you can filter by, and how many keys are published per locale. Add ?project= when the token was given several — see Authentication above for when that is.',
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
    code: curlExample(`/api/v1/locales/en?release=${RELEASE_EXAMPLE}`),
  },
  {
    title: 'Every locale in one bundle',
    description:
      'All locales in a single round trip. Same shape, keyed by locale.',
    code: curlExample('/api/v1/bundle'),
  },
])

/**
 * Writes exist for one caller so far: a design-tool plugin that imports a frame
 * as a page. Same token, but only a `write` scope is allowed through.
 */
const writeExamples = computed(() => [
  {
    title: 'Create a page from a screenshot',
    description:
      'Upload the image first, then send its key here with the tag rectangles. Coordinates are in the screenshot’s own pixels. This is the one import route that names a project, because it creates one.',
    code: `# 1. upload (multipart, one file field)
curl -X POST -H "Authorization: Bearer <token>" \\
  -F "file=@screen.png" \\
  ${baseUrl.value}/api/v1/uploads

# 2. create, with the returned key
curl -X POST -H "Authorization: Bearer <token>" \\
  -H "Content-Type: application/json" \\
  -d '{"name":"Home","image":"<key>","tags":[{"figmaNodeId":"1:2","x":10,"y":20,"width":80,"height":24,"i18nKey":"home.title"}]}' \\
  "${baseUrl.value}/api/v1/pages?project=<id-or-name>"`,
  },
  {
    title: 'Re-import a page',
    description:
      'Idempotent by node id: tags whose node still exists have their geometry updated, new ones are created, and tags whose node is gone come back as `stale` without being deleted. The page names the project, so the URL does not.',
    code: `curl -X PATCH -H "Authorization: Bearer <token>" \\
  -H "Content-Type: application/json" \\
  -d '{"tags":[{"figmaNodeId":"1:2","x":10,"y":20,"width":80,"height":24,"i18nKey":null}]}' \\
  ${baseUrl.value}/api/v1/pages/12`,
  },
  {
    title: 'Read a page’s tags',
    description:
      'What an importer fetches before deciding what to update. A page the token was not granted looks exactly like one that does not exist.',
    code: curlExample('/api/v1/pages/12/tags'),
  },
])

const fetchExample = computed(
  () => `const res = await fetch(
  '${baseUrl.value}/api/v1/locales/en',
  { headers: { Authorization: 'Bearer ' + process.env.LOCALNESS_API_TOKEN } }
)
const messages = await res.json()`
)

/**
 * Same token, same copy, spoken as MCP so an agent can read it directly. The
 * project goes in the URL rather than in a tool argument, so the tool list an
 * agent reads stays the same no matter how many projects the token reaches — and
 * one MCP entry means one project.
 */
const mcpConfig = computed(
  () => `{
  "mcpServers": {
    "localness": {
      "url": "${baseUrl.value}/mcp?project=<id-or-name>",
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
          Access to published copy. Drafts are never reachable with a token, and
          versioned by <code class="text-xs">release</code> only. A token is
          read-only unless you mint it as
          <span class="text-default">write</span>, which also lets a design tool
          import a frame as a page.
        </p>
      </header>

      <ApiTokensSlideover />

      <section class="flex flex-col gap-3">
        <h2 class="text-sm font-semibold">Authentication</h2>
        <div
          class="rounded-lg border border-default p-3 flex flex-col gap-2 text-sm"
        >
          <p class="text-muted">
            Send a token as a bearer credential. A token belongs to you and names
            the projects it may reach, so a consumer holding nothing but a token
            starts at
            <code class="text-xs">/api/v1/projects</code> to learn what it can
            serve.
          </p>
          <p class="text-muted">
            <span class="text-default">When does a request need ?project=?</span>
            Count the projects a token was
            <span class="text-default">given</span> — not how many you can still
            reach today. Given exactly one, no request ever names it, which
            includes every token minted before tokens became personal. Given
            several, every request that cannot work it out for itself must say
            which: the reads, <code class="text-xs">POST /pages</code>, and the
            MCP URL. The routes addressed by a page id never do — the page
            already says it, and sending a different one is a 400.
          </p>
          <p class="text-muted">
            Reach is re-checked against your team memberships on every request.
            Leave a team and the tokens naming it stop working, without anyone
            having to revoke them — but the count above does not change, so
            <code class="text-xs">?project=</code> is still required.
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
        <h2 class="text-sm font-semibold">Importing from a design tool</h2>
        <p class="text-sm text-muted">
          These need a <span class="text-default">write</span> token; a read
          token gets a 403. They only ever touch pages of the token's own
          project. Importing never creates i18n keys — tag text that matches no
          published key is left unbound for you to fill in.
        </p>
        <div
          v-for="example in writeExamples"
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
          <code class="text-xs">search_by_text</code>. None of them takes a
          project: it goes in the server URL as
          <code class="text-xs">?project=</code>, so the tool list an agent reads
          stays the same however many projects the token reaches, and one entry
          here means one project. Omit it when the token reaches exactly one.
          Every tool except the first can also be narrowed to a single release,
          the same way <code class="text-xs">?release=</code> does above. Omit
          release when proofreading a product locale folder against the full
          catalog.
        </p>
        <pre
          class="rounded-lg border border-default bg-elevated/50 p-3 text-xs overflow-x-auto"
        ><code>{{ mcpConfig }}</code></pre>
      </section>
    </div>
  </div>
</template>
