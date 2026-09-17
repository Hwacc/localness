import { createMcpHandler, McpServer } from '@modelcontextprotocol/server'
import type { AuthInfo } from '@modelcontextprotocol/server'
import { z } from 'zod'
import { listReleases } from '#server/helper/release'
import {
  deliveryBundle,
  deliveryKey,
  deliveryKeyLocales,
  deliveryLocale,
  deliveryMeta,
  listDeliveryKeys,
  listUnpublishedDeliveryKeys,
  projectLocales,
  resolveReleaseParam,
  searchDeliveryKeys,
  searchDeliveryKeysByText,
} from '#server/helper/api-delivery'

/**
 * The MCP face of the delivery API, served at `/mcp`.
 *
 * No tool takes a project, for the same reason `/api/v1` stopped carrying one in
 * its path: the credential *is* the project. The route resolves it once and
 * passes it through `authInfo.extra`, so the tools never re-derive it and cannot
 * disagree with the token that was actually checked.
 *
 * Every tool delegates to the same `api-delivery` helpers the REST endpoints
 * use. That is deliberate — two ways to fetch copy that could drift is exactly
 * the failure this API is built to avoid.
 */

/** Set by the route from the authenticated token row. */
type ProjectScope = { projectId?: number }

function projectIdFrom(authInfo: AuthInfo | undefined): number {
  const projectId = (authInfo?.extra as ProjectScope | undefined)?.projectId
  if (typeof projectId !== 'number') {
    // Unreachable unless the route stops passing it, which is a wiring bug.
    throw new Error('MCP request arrived without a project scope')
  }
  return projectId
}

const text = (value: unknown) => ({
  content: [{ type: 'text' as const, text: JSON.stringify(value, null, 2) }],
})

/**
 * A release name that does not exist is a mistake the caller can fix, so it has
 * to say so. Widening to the whole project instead would look filtered and not
 * be, and the caller has no way to notice.
 */
async function releaseIdOf(projectId: number, raw: string | undefined) {
  try {
    return await resolveReleaseParam(projectId, raw)
  } catch {
    throw new Error(
      `No release named "${raw}" in this project. Call get_project_info to list the release names.`
    )
  }
}

/**
 * Shared by every tool that can be narrowed. A tool description is the only
 * documentation an agent gets, and "release name or id" on its own says nothing
 * about *when* a caller wants one — which is the half an enum could never have
 * supplied even if we had narrowed the schema.
 */
const RELEASE_PARAM = z
  .string()
  .optional()
  .describe(
    'A release name or id, to narrow to what shipped in that version. Omit for everything published — omit when proofreading a product locale folder against the full catalog. get_project_info lists the names.'
  )

const OFFSET_PARAM = z
  .number()
  .optional()
  .describe('Skip this many keys after sorting by name. Default 0.')

const LIST_LIMIT_PARAM = z
  .number()
  .optional()
  .describe('Page size. Default 1000, max 5000.')

function missingKeyError(key: string, release: string | undefined) {
  return new Error(
    release
      ? `No key "${key}" in release "${release}". It may exist outside that release — list_keys or search_keys without a release will say.`
      : `No key "${key}" in this project. Use list_keys or search_keys to find the right one.`
  )
}

export const mcpHandler = createMcpHandler(
  async ({ authInfo }) => {
    const projectId = projectIdFrom(authInfo)

    // Fetched per request purely so `get_project_info`'s description can name
    // the releases: an agent cannot call a scope it has never heard of, and a
    // description is the only place it can hear about one before calling. One
    // small `findMany` per request buys that; a cache would buy staleness.
    const releases = await listReleases(projectId)
    const releaseHint = releases.length
      ? `The other tools can be narrowed to one of this project's releases: ${releases
          .map((release) => release.name)
          .join(', ')}.`
      : 'This project has no releases, so the other tools cannot be narrowed.'

    const server = new McpServer({ name: 'localness', version: '1.0.0' })

    server.registerTool(
      'get_project_info',
      {
        title: 'Project info',
        description:
          `Which project this token serves, its locales, fallback locale, and how many keys are published per locale. ${releaseHint} For a full-catalog proofread omit release on the other tools; use list_keys, get_key, search_by_text, and list_unpublished_keys for dictionary facts. Start here.`,
      },
      async () => text(await deliveryMeta(projectId, null))
    )

    server.registerTool(
      'get_translations',
      {
        title: 'Published copy for one locale',
        description:
          'Flat { key: text } map of published copy. Keys with nothing published are omitted rather than returned empty, so a missing key means untranslated.',
        inputSchema: z.object({
          locale: z
            .string()
            .describe('Locale code, such as "en". See get_project_info.'),
          release: RELEASE_PARAM,
        }),
      },
      async ({ locale, release }) => {
        const releaseId = await releaseIdOf(projectId, release)
        return text(await deliveryLocale(projectId, locale, releaseId))
      }
    )

    server.registerTool(
      'get_all_translations',
      {
        title: 'Every locale in one bundle',
        description:
          'All locales at once, keyed by locale: { locale: { key: text } }. One call for a whole runtime bundle.',
        inputSchema: z.object({ release: RELEASE_PARAM }),
      },
      async ({ release }) => {
        const releaseId = await releaseIdOf(projectId, release)
        const locales = await projectLocales(projectId)
        return text(await deliveryBundle(projectId, releaseId, locales))
      }
    )

    server.registerTool(
      'get_translation',
      {
        title: 'One key in one locale',
        description:
          'The published text for a single key. Prefer this over fetching a whole locale once the key is known.',
        inputSchema: z.object({
          key: z.string().describe('The i18n key, exactly as a bundle spells it.'),
          locale: z.string(),
          release: RELEASE_PARAM,
        }),
      },
      async ({ key, locale, release }) => {
        const releaseId = await releaseIdOf(projectId, release)
        const result = await deliveryKey(projectId, key, locale, releaseId)
        if (result.state === 'missing') {
          throw missingKeyError(key, release)
        }
        // A key that exists but has no published text here is an answer, not a
        // failure: it says this locale needs work. Returning `text: ''` would
        // invite a blank on screen instead.
        return text(
          result.state === 'published'
            ? { key, locale, published: true, text: result.text }
            : { key, locale, published: false }
        )
      }
    )

    server.registerTool(
      'search_keys',
      {
        title: 'Find keys by name',
        description:
          'Keys whose name contains the query, restricted to keys that have published copy somewhere. Names only — call get_key or get_translation for the text. For the full catalog use list_keys.',
        inputSchema: z.object({
          query: z
            .string()
            .describe('Substring of the key name, such as "login".'),
          release: RELEASE_PARAM,
        }),
      },
      async ({ query, release }) => {
        const releaseId = await releaseIdOf(projectId, release)
        return text(await searchDeliveryKeys(projectId, query, releaseId))
      }
    )

    server.registerTool(
      'list_keys',
      {
        title: 'Official key names',
        description:
          'Paginated names of keys that have published copy somewhere. Use this to diff against a product locale JSON file. Omit release unless you want one version slice.',
        inputSchema: z.object({
          offset: OFFSET_PARAM,
          limit: LIST_LIMIT_PARAM,
          release: RELEASE_PARAM,
        }),
      },
      async ({ offset, limit, release }) => {
        const releaseId = await releaseIdOf(projectId, release)
        return text(await listDeliveryKeys(projectId, releaseId, offset, limit))
      }
    )

    server.registerTool(
      'get_key',
      {
        title: 'One key in every locale',
        description:
          'Published state for a single key across every project locale. Unpublished locales are { published: false }, never omitted, and fallback is not merged.',
        inputSchema: z.object({
          key: z.string().describe('The i18n key, exactly as a bundle spells it.'),
          release: RELEASE_PARAM,
        }),
      },
      async ({ key, release }) => {
        const releaseId = await releaseIdOf(projectId, release)
        const result = await deliveryKeyLocales(projectId, key, releaseId)
        if (result.state === 'missing') {
          throw missingKeyError(key, release)
        }
        return text({ key: result.key, locales: result.locales })
      }
    )

    server.registerTool(
      'search_by_text',
      {
        title: 'Find keys by published text',
        description:
          'Keys whose published text in one locale matches the query. Names only — call get_key for every locale. Several keys can share a sentence; the list is the ambiguity, not a pick.',
        inputSchema: z.object({
          locale: z
            .string()
            .describe('Locale code whose published text is searched. See get_project_info.'),
          query: z.string().describe('The source sentence to look up, such as "Save".'),
          mode: z
            .enum(['exact', 'contains'])
            .optional()
            .describe('exact (default) for hardcoded replacement; contains for a substring.'),
          release: RELEASE_PARAM,
        }),
      },
      async ({ locale, query, mode, release }) => {
        const releaseId = await releaseIdOf(projectId, release)
        return text(
          await searchDeliveryKeysByText(
            projectId,
            locale,
            query,
            mode ?? 'exact',
            releaseId
          )
        )
      }
    )

    server.registerTool(
      'list_unpublished_keys',
      {
        title: 'Keys unpublished in one locale',
        description:
          'Catalog keys that have no published text in this locale. Unpublished is not missing: missing means the key is not in the project. Omit release for a full-catalog gap list.',
        inputSchema: z.object({
          locale: z
            .string()
            .describe('Locale code, such as "zh_cn". See get_project_info.'),
          offset: OFFSET_PARAM,
          limit: LIST_LIMIT_PARAM,
          release: RELEASE_PARAM,
        }),
      },
      async ({ locale, offset, limit, release }) => {
        const releaseId = await releaseIdOf(projectId, release)
        return text(
          await listUnpublishedDeliveryKeys(
            projectId,
            locale,
            releaseId,
            offset,
            limit
          )
        )
      }
    )

    return server
  },
  // Modern (2026-07-28) exchanges answer as a single JSON body: every tool is a
  // read and none emits a related message, so there is never anything to stream.
  // 2025-era clients are served by the SDK's stateless fallback, which frames its
  // one reply as an SSE message and then closes — also not a held-open stream.
  { responseMode: 'json' }
)
