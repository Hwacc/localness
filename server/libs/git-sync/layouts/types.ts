import type { GitSyncPullReason } from '#shared/constants'

/** Locale -> key -> text, as read from the remote. */
export type RemoteLocaleMap = Map<string, Map<string, string>>

/** One remote locale file, classified against `seenFiles`. */
export type RemoteFileInfo = {
  relPath: string
  sha: string
  locale: string | null
  remoteLocale: string
  date: string
  reason: GitSyncPullReason
}

/**
 * Everything Git sync needs to know about where a remote keeps its locale
 * files. Three-way, conflict cards, base, previews and commit/push are shared
 * in `sync.ts`; only file layout differs between adapters.
 */
export type GitSyncLayoutContext = {
  repoRoot: string
  /** `GitSyncBinding.product`: LILT product folder, or the locale directory. */
  scope: string
  /** `GitSyncBinding.options`, raw. Each adapter parses its own. */
  options: unknown
  localeMap: Record<string, string> | null
  /** Project locales, loaded only by adapters that look files up per locale. */
  loadLocales: () => Promise<string[]>
}

export type GitSyncLayout = {
  /** Error text for an unusable scope / options, or null. */
  scopeError(scope: string, options: unknown): string | null
  /** Lists choosable scopes, when the layout can tell them from the repo. */
  discover: ((repoRoot: string) => Promise<{ value: string; label: string }[]>) | null
  /** Every locale file, in merge order (later wins). */
  listFiles(ctx: GitSyncLayoutContext, seen?: Map<string, string>): Promise<RemoteFileInfo[]>
  readLocales(
    ctx: GitSyncLayoutContext,
    files: RemoteFileInfo[]
  ): Promise<{ maps: RemoteLocaleMap; origin: Map<string, string> }>
  /** The remote's current source-locale text: Push's three-way "theirs". */
  readSource(ctx: GitSyncLayoutContext, sourceLocale: string): Promise<Map<string, string>>
  /**
   * The source sentence a translated file's key was written against, when
   * the layout records it (LILT pairs by batch id). Null when unknown.
   */
  sourceTextFor(
    ctx: GitSyncLayoutContext,
    files: RemoteFileInfo[],
    sourceLocale: string
  ): Promise<(relPath: string, key: string) => string | null>
  /** Keys the source file's layout cannot hold. */
  unwritableKeys(
    ctx: GitSyncLayoutContext,
    sourceLocale: string,
    keys: string[]
  ): Promise<Set<string>>
  /**
   * Writes the overlay. `sha` is recorded as seen; `''` means "seen, content
   * unknown". `summary` goes into the commit subject.
   */
  writeSource(
    ctx: GitSyncLayoutContext,
    sourceLocale: string,
    entries: Record<string, string>
  ): Promise<{ relPath: string; sha: string; summary: string }>
}
